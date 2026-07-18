import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNpmVersionDates } from './npm-registry-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('fetchNpmVersionDates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps every version to its publish date, excluding the created/modified bookkeeping keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          time: {
            created: '2020-01-01T00:00:00.000Z',
            modified: '2024-01-01T00:00:00.000Z',
            '1.0.0': '2020-01-01T00:00:00.000Z',
            '1.1.0': '2021-06-15T00:00:00.000Z',
          },
        }),
      ),
    );

    const dates = await fetchNpmVersionDates('left-pad');

    expect(dates?.size).toBe(2);
    expect(dates?.get('1.0.0')).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    expect(dates?.get('1.1.0')).toEqual(new Date('2021-06-15T00:00:00.000Z'));
  });

  it('percent-encodes each segment of a scoped package name, keeping the slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ time: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchNpmVersionDates('@my-scope/pkg');

    expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/@my-scope/pkg', undefined);
  });

  it('returns null when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(fetchNpmVersionDates('left-pad')).resolves.toBeNull();
  });
});
