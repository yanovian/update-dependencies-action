import { describe, expect, it } from 'vitest';
import { parseDependencyUpdatesReport } from './gradle-report.js';

describe('parseDependencyUpdatesReport', () => {
  it('extracts group:artifact, current, and latest release version', () => {
    const report = JSON.stringify({
      outdated: {
        dependencies: [
          {
            group: 'com.google.guava',
            name: 'guava',
            version: '30.0-jre',
            available: { release: '32.1.3-jre' },
          },
        ],
      },
    });
    expect(parseDependencyUpdatesReport(report)).toEqual([
      {
        groupArtifact: 'com.google.guava:guava',
        currentVersion: '30.0-jre',
        latestVersion: '32.1.3-jre',
      },
    ]);
  });

  it('skips a dependency with no available release', () => {
    const report = JSON.stringify({
      outdated: {
        dependencies: [{ group: 'g', name: 'a', version: '1.0', available: { release: null } }],
      },
    });
    expect(parseDependencyUpdatesReport(report)).toEqual([]);
  });

  it('returns an empty list when nothing is outdated', () => {
    expect(parseDependencyUpdatesReport(JSON.stringify({}))).toEqual([]);
  });
});
