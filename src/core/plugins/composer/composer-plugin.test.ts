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

const { createComposerPlugin } = await import('./composer-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'composer' as const,
  language: 'PHP',
  manifestPath: 'composer.json',
  directory: '.',
};
const target = { name: 'monolog/monolog', fromVersion: '3.0.0', version: '2.9.1' };

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('composer plugin pinVersion', () => {
  it('requires the exact version with --with-all-dependencies', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const plugin = createComposerPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(true);
    expect(runProcessMock).toHaveBeenCalledWith(
      'composer require monolog/monolog:2.9.1 --with-all-dependencies',
      expect.objectContaining({ allowFailure: true }),
    );
  });

  it('returns false when composer fails to pin', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const plugin = createComposerPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(false);
  });
});
