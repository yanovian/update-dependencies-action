import { afterEach, describe, expect, it, vi } from 'vitest';
import { findVulnerableEntries } from './osv-client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('findVulnerableEntries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty array without a request when there is nothing to check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(findVulnerableEntries([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps ecosystem-specific vulnerable entries to OSV IDs, in query order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [{ vulns: [{ id: 'GHSA-aaaa' }] }, {}],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const matches = await findVulnerableEntries([
      { ecosystem: 'npm', name: 'left-pad', version: '1.0.0' },
      { ecosystem: 'cargo', name: 'serde', version: '1.0.0' },
    ]);

    expect(matches).toEqual([
      {
        query: { ecosystem: 'npm', name: 'left-pad', version: '1.0.0' },
        vulnerabilityIds: ['GHSA-aaaa'],
      },
    ]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      queries: { package: { ecosystem: string } }[];
    };
    expect(requestBody.queries[0]?.package.ecosystem).toBe('npm');
    expect(requestBody.queries[1]?.package.ecosystem).toBe('crates.io');
  });

  it('maps yarn and pnpm to the npm ecosystem, and gradle to Maven', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [{}, {}] }));
    vi.stubGlobal('fetch', fetchMock);

    await findVulnerableEntries([
      { ecosystem: 'yarn', name: 'left-pad', version: '1.0.0' },
      { ecosystem: 'gradle', name: 'com.example:lib', version: '1.0.0' },
    ]);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      queries: { package: { ecosystem: string } }[];
    };
    expect(requestBody.queries[0]?.package.ecosystem).toBe('npm');
    expect(requestBody.queries[1]?.package.ecosystem).toBe('Maven');
  });

  it('returns null when the request fails, so the caller can fail open', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    await expect(
      findVulnerableEntries([{ ecosystem: 'npm', name: 'left-pad', version: '1.0.0' }]),
    ).resolves.toBeNull();
  });
});
