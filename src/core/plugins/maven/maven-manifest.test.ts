import { describe, expect, it } from 'vitest';
import { detectMavenManifests, readDependencyVersions } from './maven-manifest.js';

describe('detectMavenManifests', () => {
  it('finds pom.xml anywhere in the repo', () => {
    expect(detectMavenManifests(['services/api/pom.xml'])).toEqual([
      {
        ecosystem: 'maven',
        language: 'Java/JVM',
        manifestPath: 'services/api/pom.xml',
        directory: 'services/api',
      },
    ]);
  });
});

describe('readDependencyVersions', () => {
  it('reads a literal version', () => {
    const pom = `
<project>
  <dependencies>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>32.1.3-jre</version>
    </dependency>
  </dependencies>
</project>`;
    expect(readDependencyVersions(pom)).toEqual(
      new Map([['com.google.guava:guava', '32.1.3-jre']]),
    );
  });

  it('resolves a version declared through a property', () => {
    const pom = `
<project>
  <properties>
    <guava.version>32.1.3-jre</guava.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>com.google.guava</groupId>
      <artifactId>guava</artifactId>
      <version>\${guava.version}</version>
    </dependency>
  </dependencies>
</project>`;
    expect(readDependencyVersions(pom)).toEqual(
      new Map([['com.google.guava:guava', '32.1.3-jre']]),
    );
  });

  it('handles a single dependency without collapsing the array', () => {
    const pom = `
<project>
  <dependencies>
    <dependency>
      <groupId>g</groupId>
      <artifactId>a</artifactId>
      <version>1.0.0</version>
    </dependency>
  </dependencies>
</project>`;
    expect(readDependencyVersions(pom).size).toBe(1);
  });
});
