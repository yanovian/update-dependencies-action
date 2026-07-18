import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoModuleVersionDates } from './go-proxy-client.js';

function textResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('fetchGoModuleVersionDates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('escapes uppercase letters in the module path per the goproxy protocol', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/@v/list')) {
        return Promise.resolve(textResponse('v1.0.0\n'));
      }
      return Promise.resolve(jsonResponse({ Version: 'v1.0.0', Time: '2020-01-01T00:00:00Z' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchGoModuleVersionDates('github.com/BurntSushi/toml');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.golang.org/github.com/!burnt!sushi/toml/@v/list',
      undefined,
    );
  });

  it('fetches the date for each version and returns them keyed by version', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/@v/list')) {
        return Promise.resolve(textResponse('v1.0.0\nv1.1.0\nv1.2.0-beta\n'));
      }
      if (url.endsWith('/v1.0.0.info')) {
        return Promise.resolve(jsonResponse({ Version: 'v1.0.0', Time: '2020-01-01T00:00:00Z' }));
      }
      if (url.endsWith('/v1.1.0.info')) {
        return Promise.resolve(jsonResponse({ Version: 'v1.1.0', Time: '2021-01-01T00:00:00Z' }));
      }
      if (url.endsWith('/v1.2.0-beta.info')) {
        return Promise.resolve(
          jsonResponse({ Version: 'v1.2.0-beta', Time: '2022-01-01T00:00:00Z' }),
        );
      }
      return Promise.resolve(new Response('', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const dates = await fetchGoModuleVersionDates('github.com/foo/bar');

    expect(dates?.get('v1.0.0')).toEqual(new Date('2020-01-01T00:00:00Z'));
    expect(dates?.get('v1.1.0')).toEqual(new Date('2021-01-01T00:00:00Z'));
    expect(dates?.get('v1.2.0-beta')).toEqual(new Date('2022-01-01T00:00:00Z'));
  });

  it('returns null when the version list itself cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(fetchGoModuleVersionDates('github.com/foo/bar')).resolves.toBeNull();
  });
});
