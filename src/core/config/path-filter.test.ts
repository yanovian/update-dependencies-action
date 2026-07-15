import { describe, expect, it } from 'vitest';
import { isPathIgnored } from './path-filter.js';

describe('isPathIgnored', () => {
  it('matches an exact directory', () => {
    expect(isPathIgnored('examples', ['examples'])).toBe(true);
  });

  it('matches a directory nested under a configured prefix', () => {
    expect(isPathIgnored('examples/broken', ['examples'])).toBe(true);
  });

  it('does not match a sibling directory that merely shares a prefix string', () => {
    expect(isPathIgnored('examples-extra', ['examples'])).toBe(false);
  });

  it('treats the repo root as never ignored unless "." is explicitly listed', () => {
    expect(isPathIgnored('.', ['examples'])).toBe(false);
  });

  it('returns false with no ignore paths configured', () => {
    expect(isPathIgnored('anything', [])).toBe(false);
  });
});
