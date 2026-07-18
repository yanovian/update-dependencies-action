import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { readFileMock, writeFileMock, listRepoFilesMock, runProcessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  listRepoFilesMock: vi.fn(),
  runProcessMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock, writeFile: writeFileMock }));
vi.mock('../../discovery/list-repo-files.js', () => ({ listRepoFiles: listRepoFilesMock }));
vi.mock('../../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { createGradlePlugin } = await import('./gradle-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'gradle' as const,
  language: 'Java/JVM (Gradle)',
  manifestPath: 'build.gradle',
  directory: '.',
};

function enoent(): NodeJS.ErrnoException {
  const error = new Error('not found') as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
}

beforeEach(() => {
  readFileMock.mockReset();
  writeFileMock.mockReset();
  listRepoFilesMock.mockReset();
  runProcessMock.mockReset();
  listRepoFilesMock.mockResolvedValue(['build.gradle']);
  // No gradlew wrapper, no gradle.lockfile: resolveGradleCommand falls back to "gradle", and
  // refreshDependencyLocksIfEnabled is a no-op since there is nothing to relock.
  readFileMock.mockImplementation((filePath: string) => {
    if (filePath.endsWith('build.gradle')) {
      return Promise.resolve("implementation 'com.example:lib:1.5.0'\n");
    }
    return Promise.reject(enoent());
  });
});

describe('gradle plugin pinVersion', () => {
  it('rewrites the declared version in the plain build file', async () => {
    const plugin = createGradlePlugin();

    const pinned = await plugin.pinVersion?.(location, 'com.example:lib', '1.4.0', {
      repoRoot: '/repo',
      logger,
    });

    expect(pinned).toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('build.gradle'),
      expect.stringContaining('com.example:lib:1.4.0'),
      'utf8',
    );
  });

  it('returns false when the dependency is not declared in any build file', async () => {
    const plugin = createGradlePlugin();

    const pinned = await plugin.pinVersion?.(location, 'com.example:missing', '1.4.0', {
      repoRoot: '/repo',
      logger,
    });

    expect(pinned).toBe(false);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
