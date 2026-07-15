import { describe, expect, it } from 'vitest';
import { rewriteVersionCatalog } from './gradle-version-catalog.js';

describe('rewriteVersionCatalog', () => {
  it('rewrites a version.ref entry through the versions table', () => {
    const original = `
[versions]
guava = "30.0-jre"

[libraries]
guava = { module = "com.google.guava:guava", version.ref = "guava" }
`;
    const candidates = new Map([
      ['com.google.guava:guava', { from: '30.0-jre', to: '32.1.3-jre' }],
    ]);
    const result = rewriteVersionCatalog(original, candidates, '.');

    expect(result.content).toContain('32.1.3-jre');
    expect(result.changes).toHaveLength(1);
    expect(result.appliedGroupArtifacts.has('com.google.guava:guava')).toBe(true);
  });

  it('rewrites a literal version field directly', () => {
    const original = `
[libraries]
guava = { group = "com.google.guava", name = "guava", version = "30.0-jre" }
`;
    const candidates = new Map([
      ['com.google.guava:guava', { from: '30.0-jre', to: '32.1.3-jre' }],
    ]);
    const result = rewriteVersionCatalog(original, candidates, '.');
    expect(result.content).toContain('32.1.3-jre');
    expect(result.changes).toHaveLength(1);
  });

  it('rewrites a shorthand "group:artifact:version" string', () => {
    const original = `
[libraries]
guava = "com.google.guava:guava:30.0-jre"
`;
    const candidates = new Map([
      ['com.google.guava:guava', { from: '30.0-jre', to: '32.1.3-jre' }],
    ]);
    const result = rewriteVersionCatalog(original, candidates, '.');
    expect(result.content).toContain('com.google.guava:guava:32.1.3-jre');
  });

  it('reports a manual-action note when the version has no ref and is not a literal', () => {
    const original = `
[libraries]
guava = { module = "com.google.guava:guava", version = { strictly = "[30.0, 31.0)" } }
`;
    const candidates = new Map([
      ['com.google.guava:guava', { from: '30.0-jre', to: '32.1.3-jre' }],
    ]);
    const result = rewriteVersionCatalog(original, candidates, '.');
    expect(result.changes).toEqual([]);
    expect(result.manualActionNeeded).toHaveLength(1);
  });
});
