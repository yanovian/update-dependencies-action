import { describe, expect, it } from 'vitest';
import { resolveYarnVersions } from './yarn-lockfile.js';

describe('resolveYarnVersions', () => {
  it('resolves a classic v1 lockfile by matching the exact name@range descriptor', () => {
    const lockfile = `
left-pad@^1.0.0:
  version "1.3.0"
  resolved "https://registry.yarnpkg.com/left-pad/-/left-pad-1.3.0.tgz"
`;
    const result = resolveYarnVersions(lockfile, new Map([['left-pad', '^1.0.0']]));
    expect(result).toEqual(new Map([['left-pad', '1.3.0']]));
  });

  it('resolves a Yarn Berry (YAML) lockfile', () => {
    const lockfile = `
__metadata:
  version: 6

"left-pad@npm:^1.0.0":
  version: 1.3.0
  resolution: "left-pad@npm:1.3.0"
`;
    const result = resolveYarnVersions(lockfile, new Map([['left-pad', '^1.0.0']]));
    expect(result).toEqual(new Map([['left-pad', '1.3.0']]));
  });
});
