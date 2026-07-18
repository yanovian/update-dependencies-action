import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }));
vi.mock('../../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { createMavenPlugin } = await import('./maven-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'maven' as const,
  language: 'Java/JVM',
  manifestPath: 'pom.xml',
  directory: '.',
};

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('maven plugin pinVersion', () => {
  it('forces the dependency to an exact version via use-dep-version', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const plugin = createMavenPlugin();

    const pinned = await plugin.pinVersion?.(location, 'com.example:lib', '1.2.3', {
      repoRoot: '/repo',
      logger,
    });

    expect(pinned).toBe(true);
    const command = runProcessMock.mock.calls[0]?.[0] as string;
    expect(command).toContain('use-dep-version');
    expect(command).toContain('-Dincludes=com.example:lib');
    expect(command).toContain('-DdepVersion=1.2.3');
    expect(command).toContain('-DforceVersion=true');
  });

  it('returns false when maven fails to pin', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const plugin = createMavenPlugin();

    const pinned = await plugin.pinVersion?.(location, 'com.example:lib', '1.2.3', {
      repoRoot: '/repo',
      logger,
    });

    expect(pinned).toBe(false);
  });
});
