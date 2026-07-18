import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithRetry, fetchWithRetry } from './http-retry.js';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns the response immediately on a non-retryable status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://example.test/pkg');

    expect(response?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits exactly the Retry-After duration (seconds form) before retrying a 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchWithRetry('https://example.test/pkg');
    await vi.advanceTimersByTimeAsync(2000);
    const response = await resultPromise;

    expect(response?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('parses an HTTP-date Retry-After', async () => {
    const retryAt = new Date(Date.now() + 3000).toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}, { 'retry-after': retryAt }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchWithRetry('https://example.test/pkg');
    await vi.advanceTimersByTimeAsync(3000);
    const response = await resultPromise;

    expect(response?.status).toBe(200);
  });

  it('enforces a minimum delay and still terminates when Retry-After is 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}, { 'retry-after': '0' }));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchWithRetry('https://example.test/pkg');
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    const response = await resultPromise;

    // A "Retry-After: 0" that never advanced the retry budget would retry instantly forever;
    // the floor delay guarantees the budget is exhausted (and the loop gives up) instead.
    expect(response).toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock.mock.calls.length).toBeLessThan(2000);
  });

  it('gives up and returns null instead of waiting past the retry budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}, { 'retry-after': '400' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchWithRetry('https://example.test/pkg');

    expect(response).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null on a network error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const response = await fetchWithRetry('https://example.test/pkg');

    expect(response).toBeNull();
  });
});

describe('fetchJsonWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' })));

    await expect(fetchJsonWithRetry('https://example.test/pkg')).resolves.toEqual({
      hello: 'world',
    });
  });

  it('returns null on a non-ok final response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));

    await expect(fetchJsonWithRetry('https://example.test/pkg')).resolves.toBeNull();
  });
});
