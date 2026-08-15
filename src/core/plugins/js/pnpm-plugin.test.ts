import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { readFileMock, runProcessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  runProcessMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock }));
vi.mock('../../commands/run-process.js', () => ({
  runProcess: runProcessMock,
  runPinCommand: async (command: string, cwd: string) => {
    const result = await runProcessMock(command, { cwd, allowFailure: true });
    return result.exitCode === 0;
  },
}));

const { createPnpmPlugin } = await import('./pnpm-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const ctx = { repoRoot: '/repo', logger };

beforeEach(() => {
  readFileMock.mockReset();
  runProcessMock.mockReset().mockResolvedValue({ exitCode: 0, stdout: '' });
});

describe('pnpm plugin update (workspace member)', () => {
  const workspaceMember = {
    ecosystem: 'pnpm' as const,
    language: 'JavaScript/TypeScript',
    manifestPath: 'packages/foo/package.json',
    directory: 'packages/foo',
    lockfileDirectory: '.',
  };

  it('runs the update from the package directory but reads the shared root lockfile', async () => {
    let lockfileReadCount = 0;
    readFileMock.mockImplementation((filePath: string) => {
      if (filePath.endsWith('package.json')) {
        return Promise.resolve(JSON.stringify({ dependencies: { 'left-pad': '^1.0.0' } }));
      }
      lockfileReadCount += 1;
      const version = lockfileReadCount === 1 ? '1.0.0' : '1.3.0';
      return Promise.resolve(`
importers:
  packages/foo:
    dependencies:
      left-pad:
        specifier: ^1.0.0
        version: ${version}
`);
    });

    const plugin = createPnpmPlugin();
    const result = await plugin.update(workspaceMember, 'non-breaking', ctx);

    expect(runProcessMock).toHaveBeenCalledWith('pnpm update', { cwd: '/repo/packages/foo' });
    const lockfileReads = readFileMock.mock.calls
      .map((call) => call[0] as string)
      .filter((filePath) => filePath.endsWith('pnpm-lock.yaml'));
    expect(lockfileReads).toEqual(['/repo/pnpm-lock.yaml', '/repo/pnpm-lock.yaml']);
    expect(result.changes).toEqual([
      {
        ecosystem: 'pnpm',
        path: 'packages/foo',
        name: 'left-pad',
        fromVersion: '1.0.0',
        toVersion: '1.3.0',
        breaking: false,
      },
    ]);
  });
});
