import { describe, expect, it } from 'vitest';
import { resolveComposerLockVersions } from './composer-lockfile.js';

describe('resolveComposerLockVersions', () => {
  it('reads a declared package version from either packages or packages-dev', () => {
    const lockfile = JSON.stringify({
      packages: [{ name: 'monolog/monolog', version: '3.4.0' }],
      'packages-dev': [{ name: 'phpunit/phpunit', version: '10.4.2' }],
    });
    const result = resolveComposerLockVersions(lockfile, ['monolog/monolog', 'phpunit/phpunit']);
    expect(result).toEqual(
      new Map([
        ['monolog/monolog', '3.4.0'],
        ['phpunit/phpunit', '10.4.2'],
      ]),
    );
  });
});
