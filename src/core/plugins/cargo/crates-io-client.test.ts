import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCrateVersionDates, fetchLatestCrateVersion } from './crates-io-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('fetchLatestCrateVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the max_stable_version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ crate: { max_stable_version: '1.2.3' } })),
    );

    await expect(fetchLatestCrateVersion('serde')).resolves.toBe('1.2.3');
  });
});

describe('fetchCrateVersionDates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps each version to its created_at date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          versions: [
            { num: '1.0.0', created_at: '2020-01-01T00:00:00.000Z' },
            { num: '1.1.0', created_at: '2021-06-15T00:00:00.000Z' },
          ],
        }),
      ),
    );

    const dates = await fetchCrateVersionDates('serde');

    expect(dates?.get('1.0.0')).toEqual(new Date('2020-01-01T00:00:00.000Z'));
    expect(dates?.get('1.1.0')).toEqual(new Date('2021-06-15T00:00:00.000Z'));
  });

  it('returns null on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(fetchCrateVersionDates('serde')).resolves.toBeNull();
  });
});
