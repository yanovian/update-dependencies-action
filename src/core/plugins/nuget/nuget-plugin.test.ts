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

const { createNuGetPlugin } = await import('./nuget-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'nuget' as const,
  language: 'C#/.NET',
  manifestPath: 'App.csproj',
  directory: '.',
};
const target = { name: 'Newtonsoft.Json', fromVersion: '13.0.3', version: '13.0.1' };

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('nuget plugin pinVersion', () => {
  it('pins the package to an exact version via dotnet add package', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const plugin = createNuGetPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(true);
    expect(runProcessMock).toHaveBeenCalledWith(
      'dotnet add "App.csproj" package Newtonsoft.Json --version 13.0.1',
      expect.objectContaining({ allowFailure: true }),
    );
  });

  it('returns false when dotnet fails to pin', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const plugin = createNuGetPlugin();

    const pinned = await plugin.pinVersion?.(location, target, { repoRoot: '/repo', logger });

    expect(pinned).toBe(false);
  });
});
