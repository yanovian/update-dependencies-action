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
