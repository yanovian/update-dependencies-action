import { describe, expect, it } from 'vitest';
import { detectRequirementsManifests, normalizePipName, parsePinnedLine } from './pip-manifest.js';

describe('detectRequirementsManifests', () => {
  it('finds requirements.txt anywhere in the repo', () => {
    const result = detectRequirementsManifests(['api/requirements.txt', 'README.md']);
    expect(result).toEqual([
      {
        ecosystem: 'pip',
        language: 'Python',
        manifestPath: 'api/requirements.txt',
        directory: 'api',
      },
    ]);
  });
});

describe('parsePinnedLine', () => {
  it('parses a simple exact pin', () => {
    expect(parsePinnedLine('requests==2.31.0')).toEqual({ name: 'requests', version: '2.31.0' });
  });

  it('parses a pin with a trailing comment', () => {
    expect(parsePinnedLine('requests==2.31.0  # http client')).toEqual({
      name: 'requests',
      version: '2.31.0',
    });
  });

  it('returns null for a non-pin line', () => {
    expect(parsePinnedLine('requests>=2.0')).toBeNull();
    expect(parsePinnedLine('-r base.txt')).toBeNull();
    expect(parsePinnedLine('# a comment')).toBeNull();
    expect(parsePinnedLine('')).toBeNull();
  });
});

describe('normalizePipName', () => {
  it('treats dashes, underscores, and dots as equivalent, case-insensitively', () => {
    expect(normalizePipName('My_Package.Name')).toBe(normalizePipName('my-package-name'));
  });
});
