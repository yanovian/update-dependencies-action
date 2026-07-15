import { describe, expect, it } from 'vitest';
import { resolvePnpmLockVersions } from './pnpm-lockfile.js';

describe('resolvePnpmLockVersions', () => {
  it('resolves from the importers["."] format with combined specifier/version objects', () => {
    const lockfile = `
importers:
  .:
    dependencies:
      left-pad:
        specifier: ^1.0.0
        version: 1.3.0(react@18.2.0)
`;
    const result = resolvePnpmLockVersions(lockfile, new Map([['left-pad', '^1.0.0']]));
    expect(result).toEqual(new Map([['left-pad', '1.3.0']]));
  });

  it('resolves from the pre-workspace root-level format with an underscore peer suffix', () => {
    const lockfile = `
dependencies:
  left-pad: 1.3.0_react@17.0.2
`;
    const result = resolvePnpmLockVersions(lockfile, new Map([['left-pad', '^1.0.0']]));
    expect(result).toEqual(new Map([['left-pad', '1.3.0']]));
  });
});
