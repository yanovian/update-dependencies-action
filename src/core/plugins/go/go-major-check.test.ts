import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectNewerMajors } from './go-major-check.js';

describe('detectNewerMajors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a manual-action note when the module proxy has a newer major', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const notes = await detectNewerMajors(
      new Map([['github.com/foo/bar', 'v1.2.3']]),
      'services/api',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.golang.org/github.com/foo/bar/v2/@latest',
    );
    expect(notes).toEqual([
      expect.objectContaining({
        ecosystem: 'go',
        path: 'services/api',
        name: 'github.com/foo/bar',
      }),
    ]);
  });

  it('escapes uppercase letters in the module path per the Go proxy convention', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await detectNewerMajors(new Map([['github.com/Foo/Bar', 'v1.0.0']]), '.');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.golang.org/github.com/!foo/!bar/v2/@latest',
    );
  });

  it('increments an existing major suffix instead of appending v2', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    await detectNewerMajors(new Map([['github.com/foo/bar/v3', 'v3.1.0']]), '.');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.golang.org/github.com/foo/bar/v4/@latest',
    );
  });

  it('reports nothing when no newer major exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await detectNewerMajors(new Map([['github.com/foo/bar', 'v1.0.0']]), '.')).toEqual([]);
  });
});
