import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';

const { readFileMock, writeFileMock, runProcessMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  runProcessMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ readFile: readFileMock, writeFile: writeFileMock }));
vi.mock('../../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { createPipPlugin } = await import('./pip-plugin.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const location = {
  ecosystem: 'pip' as const,
  language: 'Python',
  manifestPath: 'requirements.txt',
  directory: '.',
};

beforeEach(() => {
  readFileMock.mockReset();
  writeFileMock.mockReset();
  runProcessMock.mockReset();
  runProcessMock.mockImplementation(async (command: string) => {
    if (command.startsWith('pip install')) {
      return { exitCode: 0, stdout: '' };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify([
        { name: 'requests', latest_version: '2.31.0' },
        { name: 'flask', latest_version: '3.0.0' },
      ]),
    };
  });
});

describe('pip plugin', () => {
  it('rewrites a pin within the same major and reports it as non-breaking', async () => {
    readFileMock.mockResolvedValue('requests==2.20.0\n');
    const plugin = createPipPlugin();

    const result = await plugin.update(location, 'non-breaking', { repoRoot: '/repo', logger });

    expect(result.changes).toEqual([
      {
        ecosystem: 'pip',
        path: '.',
        name: 'requests',
        fromVersion: '2.20.0',
        toVersion: '2.31.0',
        breaking: false,
      },
    ]);
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining('requirements.txt'),
      'requests==2.31.0\n',
      'utf8',
    );
  });

  it('skips a major bump in non-breaking mode but applies it in breaking mode', async () => {
    readFileMock.mockResolvedValue('flask==2.0.0\n');
    const plugin = createPipPlugin();

    const nonBreaking = await plugin.update(location, 'non-breaking', {
      repoRoot: '/repo',
      logger,
    });
    expect(nonBreaking.changes).toEqual([]);
    expect(writeFileMock).not.toHaveBeenCalled();

    const breaking = await plugin.update(location, 'breaking', { repoRoot: '/repo', logger });
    expect(breaking.changes).toEqual([
      {
        ecosystem: 'pip',
        path: '.',
        name: 'flask',
        fromVersion: '2.0.0',
        toVersion: '3.0.0',
        breaking: true,
      },
    ]);
  });
});
