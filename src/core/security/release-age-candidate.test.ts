import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackageChange } from '../types/ecosystem-plugin.js';

const { findVulnerableEntries } = vi.hoisted(() => ({ findVulnerableEntries: vi.fn() }));
vi.mock('./osv-client.js', () => ({ findVulnerableEntries }));

const { pickCompliantVersion, pickSafeCompliantVersion } =
  await import('./release-age-candidate.js');

const CHANGE: PackageChange = {
  ecosystem: 'npm',
  path: '.',
  name: 'pkg-x',
  fromVersion: '1.0.0',
  toVersion: '1.5.0',
  breaking: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const thresholdDate = daysAgo(3);

/** Marks exactly one version vulnerable, matching `findVulnerableEntries`'s real per-query shape. */
async function onlyVulnerable(vulnerableVersion: string, queries: { version: string }[]) {
  return queries
    .filter((query) => query.version === vulnerableVersion)
    .map((query) => ({ query, vulnerabilityIds: ['GHSA-y'] }));
}

beforeEach(() => {
  findVulnerableEntries.mockReset();
});

describe('pickCompliantVersion', () => {
  const versionDates = new Map([
    ['1.0.0', daysAgo(40)],
    ['1.4.0', daysAgo(5)],
    ['1.5.0', daysAgo(1)],
  ]);

  it('picks the newest same-major candidate old enough to clear the threshold', () => {
    expect(pickCompliantVersion(CHANGE, versionDates, thresholdDate)?.version).toBe('1.4.0');
  });

  it('skips a version in excludedVersions and falls back to the next-best one', () => {
    const result = pickCompliantVersion(CHANGE, versionDates, thresholdDate, new Set(['1.4.0']));
    expect(result).toBeNull();
  });

  it('returns null when no candidate is old enough', () => {
    const allTooFresh = new Map([
      ['1.0.0', daysAgo(40)],
      ['1.5.0', daysAgo(1)],
    ]);
    expect(pickCompliantVersion(CHANGE, allTooFresh, thresholdDate)).toBeNull();
  });
});

describe('pickSafeCompliantVersion', () => {
  it('accepts the top candidate when it is not vulnerable', async () => {
    findVulnerableEntries.mockResolvedValue([]);
    const versionDates = new Map([
      ['1.0.0', daysAgo(40)],
      ['1.4.0', daysAgo(5)],
      ['1.5.0', daysAgo(1)],
    ]);

    const result = await pickSafeCompliantVersion(CHANGE, versionDates, thresholdDate);

    expect(result?.version).toBe('1.4.0');
    expect(findVulnerableEntries).toHaveBeenCalledTimes(1);
  });

  it('skips a vulnerable top candidate and returns the next-best one', async () => {
    findVulnerableEntries.mockImplementation((queries) => onlyVulnerable('1.4.0', queries));
    const versionDates = new Map([
      ['1.0.0', daysAgo(40)],
      ['1.3.0', daysAgo(6)],
      ['1.4.0', daysAgo(5)],
      ['1.5.0', daysAgo(1)],
    ]);

    const result = await pickSafeCompliantVersion(CHANGE, versionDates, thresholdDate);

    expect(result?.version).toBe('1.3.0');
  });

  it('returns null when every eligible candidate is vulnerable', async () => {
    findVulnerableEntries.mockResolvedValue([
      {
        query: { ecosystem: 'npm', name: 'pkg-x', version: '1.4.0' },
        vulnerabilityIds: ['GHSA-y'],
      },
    ]);
    const versionDates = new Map([
      ['1.0.0', daysAgo(40)],
      ['1.4.0', daysAgo(5)],
      ['1.5.0', daysAgo(1)],
    ]);

    const result = await pickSafeCompliantVersion(CHANGE, versionDates, thresholdDate);

    expect(result).toBeNull();
  });

  it('fails open (treats as not vulnerable) when the OSV lookup itself fails', async () => {
    findVulnerableEntries.mockResolvedValue(null);
    const versionDates = new Map([
      ['1.0.0', daysAgo(40)],
      ['1.4.0', daysAgo(5)],
    ]);

    const result = await pickSafeCompliantVersion(CHANGE, versionDates, thresholdDate);

    expect(result?.version).toBe('1.4.0');
  });
});
