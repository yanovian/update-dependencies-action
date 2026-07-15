import { describe, expect, it } from 'vitest';
import { detectJsManifests, detectNpmManifests } from './js-manifest.js';

describe('detectNpmManifests', () => {
  it('claims a package.json with no lockfile at all', () => {
    const result = detectNpmManifests(['package.json']);
    expect(result).toEqual([
      {
        ecosystem: 'npm',
        language: 'JavaScript/TypeScript',
        manifestPath: 'package.json',
        directory: '.',
      },
    ]);
  });

  it('claims a package.json next to package-lock.json', () => {
    const result = detectNpmManifests(['app/package.json', 'app/package-lock.json']);
    expect(result).toHaveLength(1);
    expect(result[0]?.directory).toBe('app');
  });

  it('does not claim a directory that has yarn.lock or pnpm-lock.yaml', () => {
    expect(detectNpmManifests(['app/package.json', 'app/yarn.lock'])).toEqual([]);
    expect(detectNpmManifests(['app/package.json', 'app/pnpm-lock.yaml'])).toEqual([]);
  });
});

describe('detectJsManifests', () => {
  it('only claims a directory that has the matching lockfile', () => {
    const result = detectJsManifests(['app/package.json', 'app/yarn.lock'], 'yarn', 'yarn.lock');
    expect(result).toEqual([
      {
        ecosystem: 'yarn',
        language: 'JavaScript/TypeScript',
        manifestPath: 'app/package.json',
        directory: 'app',
      },
    ]);
  });

  it('finds nothing when the lockfile is absent', () => {
    expect(detectJsManifests(['app/package.json'], 'pnpm', 'pnpm-lock.yaml')).toEqual([]);
  });
});
