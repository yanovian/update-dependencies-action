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

const { createCargoPlugin } = await import('./cargo-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'cargo' as const,
  language: 'Rust',
  manifestPath: 'Cargo.toml',
  directory: '.',
};
const target = { name: 'serde', fromVersion: '1.0.190', version: '1.0.150' };

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('cargo plugin pinVersion', () => {
  it('pins the crate to an exact version with --precise', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const plugin = createCargoPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(true);
    expect(runProcessMock).toHaveBeenCalledWith(
      'cargo update -p serde --precise 1.0.150',
      expect.objectContaining({ cwd: expect.stringContaining('repo') }),
    );
  });

  it('returns false when cargo fails to pin', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const plugin = createCargoPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(false);
  });
});
