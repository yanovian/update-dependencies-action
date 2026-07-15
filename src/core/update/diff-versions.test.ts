import { describe, expect, it } from 'vitest';
import { diffVersions, isMajorBump } from './diff-versions.js';

describe('isMajorBump', () => {
  it('is true when the leading major increases', () => {
    expect(isMajorBump('1.2.3', '2.0.0')).toBe(true);
  });

  it('is false for a minor or patch bump', () => {
    expect(isMajorBump('1.2.3', '1.9.0')).toBe(false);
    expect(isMajorBump('1.2.3', '1.2.9')).toBe(false);
  });

  it('is false when the version does not increase', () => {
    expect(isMajorBump('2.0.0', '1.0.0')).toBe(false);
    expect(isMajorBump('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('diffVersions', () => {
  it('reports only packages whose version changed, tagged by actual major jump', () => {
    const before = new Map([
      ['a', '1.0.0'],
      ['b', '2.0.0'],
      ['c', '3.0.0'],
    ]);
    const after = new Map([
      ['a', '1.1.0'],
      ['b', '3.0.0'],
      ['c', '3.0.0'],
    ]);

    const changes = diffVersions(before, after, 'npm', 'packages/app');

    expect(changes).toEqual([
      {
        ecosystem: 'npm',
        path: 'packages/app',
        name: 'a',
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        breaking: false,
      },
      {
        ecosystem: 'npm',
        path: 'packages/app',
        name: 'b',
        fromVersion: '2.0.0',
        toVersion: '3.0.0',
        breaking: true,
      },
    ]);
  });

  it('ignores packages only present in one snapshot', () => {
    const before = new Map([['a', '1.0.0']]);
    const after = new Map([
      ['a', '1.0.0'],
      ['b', '1.0.0'],
    ]);
    expect(diffVersions(before, after, 'npm', '.')).toEqual([]);
  });
});
