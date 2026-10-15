import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runProcessMock, writeTempFileMock } = vi.hoisted(() => ({
  runProcessMock: vi.fn(),
  writeTempFileMock: vi.fn(),
}));

vi.mock('../commands/run-process.js', () => ({ runProcess: runProcessMock }));
vi.mock('../util/write-temp-file.js', () => ({ writeTempFile: writeTempFileMock }));

const { createGitClient } = await import('./git-client.js');

beforeEach(() => {
  runProcessMock.mockReset().mockResolvedValue({ exitCode: 0, stdout: '' });
  writeTempFileMock.mockReset().mockResolvedValue('/tmp/message.txt');
});

describe('commit', () => {
  it('adds only the given paths, never the whole tree', async () => {
    const git = createGitClient('/repo');

    await git.commit(['app', 'website'], 'chore: update deps');

    const addCall = runProcessMock.mock.calls.find((call) =>
      (call[0] as string).startsWith('git add'),
    );
    expect(addCall?.[0]).toBe('git add -- "app" "website"');
    expect(addCall?.[0]).not.toContain('-A');
  });

  it('commits using the message file, not an inline message', async () => {
    const git = createGitClient('/repo');

    await git.commit(['.'], 'chore: update deps');

    const commitCall = runProcessMock.mock.calls.find((call) =>
      (call[0] as string).startsWith('git commit'),
    );
    expect(commitCall?.[0]).toBe('git commit -F "/tmp/message.txt"');
  });
});

describe('commit with excluded paths', () => {
  it('unstages the excluded paths after adding', async () => {
    const git = createGitClient('/repo');

    await git.commit(['.'], 'chore: update deps', ['.github/workflows']);

    const commands = runProcessMock.mock.calls.map((call) => call[0] as string);
    expect(commands).toContain('git reset -q -- ".github/workflows"');
    expect(commands.indexOf('git reset -q -- ".github/workflows"')).toBeLessThan(
      commands.findIndex((command) => command.startsWith('git commit')),
    );
  });
});

describe('undoLastCommit', () => {
  it('drops the commit but keeps its changes in the working tree', async () => {
    const git = createGitClient('/repo');

    await git.undoLastCommit();

    const commands = runProcessMock.mock.calls.map((call) => call[0] as string);
    expect(commands).toEqual(['git reset -q --soft HEAD~1', 'git reset -q']);
  });
});
