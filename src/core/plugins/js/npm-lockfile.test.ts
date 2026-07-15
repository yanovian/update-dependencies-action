import { describe, expect, it } from 'vitest';
import { resolvePackageLockVersions } from './npm-lockfile.js';

describe('resolvePackageLockVersions', () => {
  it('reads the resolved version of each declared dependency', () => {
    const lockfile = JSON.stringify({
      packages: {
        'node_modules/left-pad': { version: '1.3.0' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    });
    const declared = new Map([
      ['left-pad', '^1.0.0'],
      ['lodash', '^4.0.0'],
    ]);

    expect(resolvePackageLockVersions(lockfile, declared)).toEqual(
      new Map([
        ['left-pad', '1.3.0'],
        ['lodash', '4.17.21'],
      ]),
    );
  });

  it('skips a declared dependency missing from the lockfile', () => {
    const lockfile = JSON.stringify({ packages: {} });
    expect(resolvePackageLockVersions(lockfile, new Map([['left-pad', '^1.0.0']]))).toEqual(
      new Map(),
    );
  });
});
