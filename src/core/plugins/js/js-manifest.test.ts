import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { readFileMock, runProcessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  runProcessMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock }));
vi.mock('../../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { detectJsManifests, detectNpmManifests, pinJsVersion, runJsUpdate } =
  await import('./js-manifest.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'npm' as const,
  language: 'JavaScript/TypeScript',
  manifestPath: 'app/package.json',
  directory: 'app',
};

beforeEach(() => {
  readFileMock.mockReset();
  runProcessMock.mockReset().mockResolvedValue({ exitCode: 0, stdout: '' });
});

describe('detectNpmManifests', () => {
  it('claims a package.json with no lockfile at all', () => {
    const result = detectNpmManifests(['package.json']);
    expect(result).toEqual([
      {
        ecosystem: 'npm',
        language: 'JavaScript/TypeScript',
        manifestPath: 'package.json',
        directory: '.',
      },
    ]);
  });

  it('claims a package.json next to package-lock.json', () => {
    const result = detectNpmManifests(['app/package.json', 'app/package-lock.json']);
    expect(result).toHaveLength(1);
    expect(result[0]?.directory).toBe('app');
  });

  it('does not claim a directory that has yarn.lock or pnpm-lock.yaml', () => {
    expect(detectNpmManifests(['app/package.json', 'app/yarn.lock'])).toEqual([]);
    expect(detectNpmManifests(['app/package.json', 'app/pnpm-lock.yaml'])).toEqual([]);
  });
});

describe('detectJsManifests', () => {
  it('only claims a directory that has the matching lockfile', () => {
    const result = detectJsManifests(['app/package.json', 'app/yarn.lock'], 'yarn', 'yarn.lock');
    expect(result).toEqual([
      {
        ecosystem: 'yarn',
        language: 'JavaScript/TypeScript',
        manifestPath: 'app/package.json',
        directory: 'app',
      },
    ]);
  });

  it('finds nothing when the lockfile is absent', () => {
    expect(detectJsManifests(['app/package.json'], 'pnpm', 'pnpm-lock.yaml')).toEqual([]);
  });
});

describe('runJsUpdate', () => {
  function mockPackageJson(): void {
    readFileMock.mockImplementation(async (filePath: string) =>
      filePath.endsWith('package.json')
        ? JSON.stringify({ dependencies: { 'left-pad': '^1.0.0', lodash: '^4.0.0' } })
        : 'arbitrary lockfile contents',
    );
  }

  it('does not warn when every declared dependency resolves', async () => {
    mockPackageJson();
    const resolveVersions = vi
      .fn()
      .mockReturnValueOnce(
        new Map([
          ['left-pad', '1.0.0'],
          ['lodash', '4.0.0'],
        ]),
      )
      .mockReturnValueOnce(
        new Map([
          ['left-pad', '1.1.0'],
          ['lodash', '4.0.0'],
        ]),
      );

    const result = await runJsUpdate({
      ecosystem: 'npm',
      location,
      ctx: { repoRoot: '/repo', logger },
      lockfileName: 'package-lock.json',
      command: 'npm update',
      resolveVersions,
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(result.changes).toEqual([
      {
        ecosystem: 'npm',
        path: 'app',
        name: 'left-pad',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        breaking: false,
      },
    ]);
  });

  it('always logs the full before/after comparison, not just when something looks wrong', async () => {
    mockPackageJson();
    const resolveVersions = vi.fn().mockReturnValue(
      new Map([
        ['left-pad', '1.0.0'],
        ['lodash', '4.0.0'],
      ]),
    );

    await runJsUpdate({
      ecosystem: 'npm',
      location,
      ctx: { repoRoot: '/repo', logger },
      lockfileName: 'package-lock.json',
      command: 'npm update',
      resolveVersions,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Resolved versions compared in app:'),
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('left-pad: 1.0.0 -> 1.0.0'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('lodash: 4.0.0 -> 4.0.0'));
  });

  it('warns with the unresolved names and a lockfile snippet, and flags a manual note, when resolution comes back short', async () => {
    mockPackageJson();
    const resolveVersions = vi.fn().mockReturnValue(new Map());

    const result = await runJsUpdate({
      ecosystem: 'npm',
      location,
      ctx: { repoRoot: '/repo', logger },
      lockfileName: 'package-lock.json',
      command: 'npm update',
      resolveVersions,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Before update: resolved 0/2 declared dependencies'),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('left-pad, lodash'));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('arbitrary lockfile contents'),
    );
    expect(result.changes).toEqual([]);
    expect(result.manualActionNeeded).toEqual([
      expect.objectContaining({
        ecosystem: 'npm',
        path: 'app',
        name: null,
        reason: expect.stringContaining("doesn't list every dependency"),
      }),
    ]);
  });

  it('does not flag a manual note when resolution was complete and the diff is genuinely empty', async () => {
    mockPackageJson();
    const resolveVersions = vi.fn().mockReturnValue(
      new Map([
        ['left-pad', '1.0.0'],
        ['lodash', '4.0.0'],
      ]),
    );

    const result = await runJsUpdate({
      ecosystem: 'npm',
      location,
      ctx: { repoRoot: '/repo', logger },
      lockfileName: 'package-lock.json',
      command: 'npm update',
      resolveVersions,
    });

    expect(result.changes).toEqual([]);
    expect(result.manualActionNeeded).toEqual([]);
    expect(result.diskChangeExplained).toBe(true);
  });

  it('reports a range-only change as indirect when the resolved version did not move', async () => {
    let packageJsonReadCount = 0;
    readFileMock.mockImplementation(async (filePath: string) => {
      if (!filePath.endsWith('package.json')) {
        return 'arbitrary lockfile contents';
      }
      packageJsonReadCount += 1;
      const range = packageJsonReadCount === 1 ? '^19.2.0' : '^19.2.7';
      return JSON.stringify({ dependencies: { react: range } });
    });
    const resolveVersions = vi.fn().mockReturnValue(new Map([['react', '19.2.7']]));

    const result = await runJsUpdate({
      ecosystem: 'npm',
      location,
      ctx: { repoRoot: '/repo', logger },
      lockfileName: 'package-lock.json',
      command: 'npm update',
      resolveVersions,
    });

    expect(result.changes).toEqual([
      {
        ecosystem: 'npm',
        path: 'app',
        name: 'react',
        fromVersion: '^19.2.0',
        toVersion: '^19.2.7',
        breaking: false,
        indirect: true,
      },
    ]);
  });
});

describe('pinJsVersion', () => {
  it('runs the given install command with an explicit name@version', async () => {
    const installCommand = vi.fn((pkg: string) => `npm install ${pkg}`);

    const pinned = await pinJsVersion(
      installCommand,
      location,
      { name: 'left-pad', version: '1.2.3' },
      { repoRoot: '/repo', logger },
    );

    expect(pinned).toBe(true);
    expect(installCommand).toHaveBeenCalledWith('left-pad@1.2.3');
    expect(runProcessMock).toHaveBeenCalledWith(
      'npm install left-pad@1.2.3',
      expect.objectContaining({ allowFailure: true }),
    );
  });

  it('returns false when the install command fails', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '' });

    const pinned = await pinJsVersion(
      (pkg) => `npm install ${pkg}`,
      location,
      { name: 'left-pad', version: '1.2.3' },
      { repoRoot: '/repo', logger },
    );

    expect(pinned).toBe(false);
  });
});
