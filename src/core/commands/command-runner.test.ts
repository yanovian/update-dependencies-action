import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logging/logger.js';

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }));
vi.mock('./run-process.js', () => ({ runProcess: runProcessMock }));

const { parseCommands, runCommands } = await import('./command-runner.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('parseCommands', () => {
  it('splits on newlines and drops blank lines and comments', () => {
    expect(parseCommands('npm test\n\n# a comment\nnpm run lint\n')).toEqual([
      'npm test',
      'npm run lint',
    ]);
  });

  it('strips an optional leading "- " so check-commands can look like a list', () => {
    expect(parseCommands('- npm test\n- npm run lint')).toEqual(['npm test', 'npm run lint']);
  });

  it('leaves a command that starts with a bare dash flag untouched', () => {
    expect(parseCommands('-v')).toEqual(['-v']);
  });
});

describe('runCommands', () => {
  it('runs every command and reports success when all exit 0', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '' });

    const summary = await runCommands(['npm test', 'npm run lint'], '/repo', logger);

    expect(runProcessMock).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      results: [
        { command: 'npm test', exitCode: 0 },
        { command: 'npm run lint', exitCode: 0 },
      ],
      allSucceeded: true,
      failedCommand: null,
    });
  });

  it('stops at the first failure and never runs the remaining commands', async () => {
    runProcessMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' });

    const summary = await runCommands(['npm test', 'npm run lint', 'npm run e2e'], '/repo', logger);

    expect(runProcessMock).toHaveBeenCalledTimes(2);
    expect(summary.allSucceeded).toBe(false);
    expect(summary.failedCommand).toBe('npm run lint');
    expect(summary.results).toEqual([
      { command: 'npm test', exitCode: 0 },
      { command: 'npm run lint', exitCode: 1 },
    ]);
  });
});
