import { describe, expect, it } from 'vitest';
import { detectComposerManifests, readDeclaredPackageNames } from './composer-manifest.js';

describe('detectComposerManifests', () => {
  it('requires composer.lock alongside composer.json', () => {
    expect(detectComposerManifests(['api/composer.json'])).toEqual([]);
    expect(detectComposerManifests(['api/composer.json', 'api/composer.lock'])).toEqual([
      {
        ecosystem: 'composer',
        language: 'PHP',
        manifestPath: 'api/composer.json',
        directory: 'api',
      },
    ]);
  });
});

describe('readDeclaredPackageNames', () => {
  it('excludes php and extension pseudo-packages', () => {
    const names = readDeclaredPackageNames({
      require: { php: '^8.1', 'ext-json': '*', 'monolog/monolog': '^3.0' },
      'require-dev': { 'phpunit/phpunit': '^10.0' },
    });
    expect(new Set(names)).toEqual(new Set(['monolog/monolog', 'phpunit/phpunit']));
  });
});
