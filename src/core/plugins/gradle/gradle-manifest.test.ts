import { describe, expect, it } from 'vitest';
import {
  detectGradleManifests,
  findBuildFiles,
  hasDependencyLocking,
  hasVersionCatalog,
} from './gradle-manifest.js';

describe('detectGradleManifests', () => {
  it('uses the settings.gradle directory for a multi-module build', () => {
    const result = detectGradleManifests([
      'settings.gradle.kts',
      'app/build.gradle.kts',
      'core/build.gradle.kts',
    ]);
    expect(result).toEqual([
      {
        ecosystem: 'gradle',
        language: 'Java/JVM (Gradle)',
        manifestPath: 'settings.gradle.kts',
        directory: '.',
      },
    ]);
  });

  it('falls back to one location per build.gradle when there is no settings file', () => {
    const result = detectGradleManifests(['module-a/build.gradle', 'module-b/build.gradle.kts']);
    expect(result).toHaveLength(2);
  });
});

describe('findBuildFiles', () => {
  it('only returns build files under the given root', () => {
    const repoFiles = ['app/build.gradle.kts', 'other-project/build.gradle', 'settings.gradle.kts'];
    expect(findBuildFiles(repoFiles, '.')).toEqual([
      'app/build.gradle.kts',
      'other-project/build.gradle',
    ]);
  });
});

describe('hasVersionCatalog', () => {
  it('detects gradle/libs.versions.toml at the root', () => {
    expect(hasVersionCatalog(['gradle/libs.versions.toml'], '.')).toBe(true);
    expect(hasVersionCatalog(['build.gradle.kts'], '.')).toBe(false);
  });
});

describe('hasDependencyLocking', () => {
  it('detects a gradle.lockfile anywhere under the root', () => {
    expect(hasDependencyLocking(['app/gradle.lockfile'], '.')).toBe(true);
    expect(hasDependencyLocking(['build.gradle.kts'], '.')).toBe(false);
  });
});
