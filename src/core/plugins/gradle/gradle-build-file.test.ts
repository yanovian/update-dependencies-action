import { describe, expect, it } from 'vitest';
import { rewriteBuildFile } from './gradle-build-file.js';

describe('rewriteBuildFile', () => {
  it('rewrites a single-quoted dependency notation', () => {
    const original = `implementation 'com.google.guava:guava:30.0-jre'\n`;
    const candidates = new Map([
      ['com.google.guava:guava', { from: '30.0-jre', to: '32.1.3-jre' }],
    ]);

    const result = rewriteBuildFile(original, candidates, 'app');

    expect(result.content).toBe(`implementation 'com.google.guava:guava:32.1.3-jre'\n`);
    expect(result.changes).toEqual([
      {
        ecosystem: 'gradle',
        path: 'app',
        name: 'com.google.guava:guava',
        fromVersion: '30.0-jre',
        toVersion: '32.1.3-jre',
        breaking: true,
      },
    ]);
    expect(result.appliedGroupArtifacts.has('com.google.guava:guava')).toBe(true);
  });

  it('rewrites a double-quoted call-style notation', () => {
    const original = `api("org.apache.commons:commons-lang3:3.12.0")\n`;
    const candidates = new Map([
      ['org.apache.commons:commons-lang3', { from: '3.12.0', to: '3.14.0' }],
    ]);
    const result = rewriteBuildFile(original, candidates, '.');
    expect(result.content).toBe(`api("org.apache.commons:commons-lang3:3.14.0")\n`);
  });

  it('leaves a dependency untouched when there is no candidate for it', () => {
    const original = `implementation 'junit:junit:4.13.2'\n`;
    const result = rewriteBuildFile(original, new Map(), '.');
    expect(result.content).toBe(original);
    expect(result.changes).toEqual([]);
  });
});
