import { beforeEach, describe, expect, it, vi } from 'vitest';

const { paginateMock, listMock, createMock, updateMock } = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  getOctokit: () => ({
    paginate: paginateMock,
    rest: { pulls: { list: listMock, create: createMock, update: updateMock } },
  }),
  context: { repo: { owner: 'example', repo: 'repo' } },
}));

const { createOrUpdatePullRequest, findStalePullRequests } = await import('./pr-manager.js');

beforeEach(() => {
  paginateMock.mockReset();
  listMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
});

describe('findStalePullRequests', () => {
  it('keeps only open pull requests on the same branch prefix, excluding the current branch', async () => {
    paginateMock.mockResolvedValue([
      {
        number: 1,
        html_url: 'https://pr/1',
        head: { ref: 'chore/update-deps/non-breaking/2026-07-01' },
      },
      {
        number: 2,
        html_url: 'https://pr/2',
        head: { ref: 'chore/update-deps/non-breaking/2026-07-16' },
      },
      { number: 3, html_url: 'https://pr/3', head: { ref: 'unrelated-branch' } },
      {
        number: 4,
        html_url: 'https://pr/4',
        head: { ref: 'chore/update-deps/breaking/2026-07-01' },
      },
    ]);

    const result = await findStalePullRequests(
      'token',
      'chore/update-deps/non-breaking',
      'chore/update-deps/non-breaking/2026-07-16',
    );

    expect(result).toEqual([
      { number: 1, url: 'https://pr/1', branchName: 'chore/update-deps/non-breaking/2026-07-01' },
    ]);
  });

  it('returns an empty list when nothing matches', async () => {
    paginateMock.mockResolvedValue([]);
    const result = await findStalePullRequests(
      'token',
      'chore/update-deps/non-breaking',
      'chore/update-deps/non-breaking/2026-07-16',
    );
    expect(result).toEqual([]);
  });
});

describe('createOrUpdatePullRequest', () => {
  it('creates a pull request when none exists for the branch', async () => {
    listMock.mockResolvedValue({ data: [] });
    createMock.mockResolvedValue({ data: { number: 7, html_url: 'https://pr/7' } });

    const result = await createOrUpdatePullRequest({
      githubToken: 'token',
      baseBranch: 'main',
      branchName: 'chore/update-deps/non-breaking/2026-07-16',
      title: 'title',
      body: 'body',
    });

    expect(createMock).toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ number: 7, url: 'https://pr/7' });
  });

  it('updates the existing pull request for the branch instead of creating a duplicate', async () => {
    listMock.mockResolvedValue({ data: [{ number: 9 }] });
    updateMock.mockResolvedValue({ data: { number: 9, html_url: 'https://pr/9' } });

    const result = await createOrUpdatePullRequest({
      githubToken: 'token',
      baseBranch: 'main',
      branchName: 'chore/update-deps/non-breaking/2026-07-16',
      title: 'title',
      body: 'body',
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 9 }));
    expect(createMock).not.toHaveBeenCalled();
    expect(result).toEqual({ number: 9, url: 'https://pr/9' });
  });
});
