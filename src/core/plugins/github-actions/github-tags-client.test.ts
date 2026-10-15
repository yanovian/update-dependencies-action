import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetGitHubApiState, setGitHubApiToken } from '../../github/github-api.js';
import { fetchGitHubActionVersionDates, listActionTags } from './github-tags-client.js';

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setGitHubApiToken('');
  resetGitHubApiState();
});

describe('listActionTags', () => {
  it('follows pagination and maps each tag to its commit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ name: 'v4', commit: { sha: 'aaa' } }], {
          link: '<https://api.github.com/repositories/1/tags?page=2>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(json([{ name: 'v3', commit: { sha: 'bbb' } }]));
    vi.stubGlobal('fetch', fetchMock);
    setGitHubApiToken('secret');

    const tags = await listActionTags('actions/checkout');

    expect(tags).toEqual(
      new Map([
        ['v4', 'aaa'],
        ['v3', 'bbb'],
      ]),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/repos/actions/checkout/tags?per_page=100',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer secret',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.github.com/repositories/1/tags?page=2');
  });

  it('returns null for a missing repo without failing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(listActionTags('private/action')).resolves.toBeNull();
  });

  it('stops calling the API for the rest of the run once rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listActionTags('actions/checkout')).resolves.toBeNull();
    await expect(listActionTags('actions/setup-node')).resolves.toBeNull();
    await expect(fetchGitHubActionVersionDates('actions/checkout')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries without the token when GitHub rejects it, and keeps going unauthenticated', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(json([{ name: 'v4', commit: { sha: 'aaa' } }]))
      .mockResolvedValueOnce(json([{ name: 'v5', commit: { sha: 'bbb' } }]));
    vi.stubGlobal('fetch', fetchMock);
    setGitHubApiToken('expired');

    await expect(listActionTags('actions/checkout')).resolves.toEqual(new Map([['v4', 'aaa']]));
    await expect(listActionTags('actions/setup-node')).resolves.toEqual(new Map([['v5', 'bbb']]));

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[2]?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('retries every parallel lookup that was sent with a rejected token', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return headers.Authorization
        ? new Response('', { status: 401 })
        : json([{ name: 'v1', commit: { sha: 'abc' } }]);
    });
    vi.stubGlobal('fetch', fetchMock);
    setGitHubApiToken('expired');

    const results = await Promise.all(
      ['a/one', 'b/two', 'c/three'].map((repo) => listActionTags(repo)),
    );

    expect(results).toEqual([
      new Map([['v1', 'abc']]),
      new Map([['v1', 'abc']]),
      new Map([['v1', 'abc']]),
    ]);
  });

  it('returns null when the network fails instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(listActionTags('actions/checkout')).resolves.toBeNull();
  });
});

describe('fetchGitHubActionVersionDates', () => {
  it('dates each release and gives floating tags their newest release date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json([
          { tag_name: 'v4.2.0', published_at: '2026-03-01T00:00:00Z' },
          { tag_name: 'v4.1.0', published_at: '2026-01-01T00:00:00Z' },
          { tag_name: 'v5.0.0', published_at: '2026-04-01T00:00:00Z', draft: true },
        ]),
      ),
    );

    const dates = await fetchGitHubActionVersionDates('actions/checkout');

    expect(dates?.get('v4.1.0')).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(dates?.get('v4.1')).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(dates?.get('v4')).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(dates?.has('v5.0.0')).toBe(false);
  });
});
