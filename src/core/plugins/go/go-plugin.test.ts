import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }));
vi.mock('../../commands/run-process.js', () => ({
  runProcess: runProcessMock,
  runPinCommand: async (command: string, cwd: string) => {
    const result = await runProcessMock(command, { cwd, allowFailure: true });
    return result.exitCode === 0;
  },
}));

const { createGoPlugin } = await import('./go-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'go' as const,
  language: 'Go',
  manifestPath: 'go.mod',
  directory: '.',
};
const target = { name: 'github.com/foo/bar', fromVersion: 'v1.3.0', version: 'v1.2.3' };

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('go plugin pinVersion', () => {
  it('pins the module with go get, then runs go mod tidy', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const plugin = createGoPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(true);
    expect(runProcessMock).toHaveBeenNthCalledWith(
      1,
      'go get github.com/foo/bar@v1.2.3',
      expect.objectContaining({ allowFailure: true }),
    );
    expect(runProcessMock).toHaveBeenNthCalledWith(
      2,
      'go mod tidy',
      expect.objectContaining({ allowFailure: true }),
    );
  });

  it('does not run go mod tidy when go get itself fails', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const plugin = createGoPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(false);
    expect(runProcessMock).toHaveBeenCalledTimes(1);
  });
});
