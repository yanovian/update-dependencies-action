import { describe, expect, it } from 'vitest';
import { resolveGemfileLockVersions } from './rubygems-lockfile.js';

const SAMPLE_LOCKFILE = `
GEM
  remote: https://rubygems.org/
  specs:
    actioncable (7.0.4)
      actionpack (= 7.0.4)
    rack (2.2.4)
    rails (7.0.4)
      actioncable (= 7.0.4)

PLATFORMS
  ruby

DEPENDENCIES
  rack (~> 2.2)
  rails (~> 7.0.4)

BUNDLED WITH
   2.4.10
`;

describe('resolveGemfileLockVersions', () => {
  it('resolves only the directly declared gems, not their transitive sub-dependencies', () => {
    expect(resolveGemfileLockVersions(SAMPLE_LOCKFILE)).toEqual(
      new Map([
        ['rack', '2.2.4'],
        ['rails', '7.0.4'],
      ]),
    );
  });

  it('strips a trailing "!" marking a git/path-sourced dependency', () => {
    const lockfile = `
GIT
  remote: https://github.com/example/gem.git
  specs:
    mygem (1.0.0)

DEPENDENCIES
  mygem!
`;
    expect(resolveGemfileLockVersions(lockfile)).toEqual(new Map([['mygem', '1.0.0']]));
  });
});
