import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

const SETTINGS_FILENAMES = new Set(['settings.gradle', 'settings.gradle.kts']);
const BUILD_FILENAMES = new Set(['build.gradle', 'build.gradle.kts']);

function firstPathPerDirectory(paths: readonly string[]): ManifestLocation[] {
  const byDirectory = new Map<string, string>();
  for (const filePath of paths) {
    const directory = path.dirname(filePath);
    if (!byDirectory.has(directory)) {
      byDirectory.set(directory, filePath);
    }
  }
  return [...byDirectory.entries()].map(([directory, manifestPath]) => ({
    ecosystem: 'gradle' as const,
    language: 'Java/JVM (Gradle)',
    manifestPath,
    directory,
  }));
}

/**
 * A Gradle build is invoked as a whole from the directory holding `settings.gradle(.kts)`, not
 * per module, so one repo with a multi-module build gets one manifest location there. A repo
 * with no settings file at all (a standalone single-module build) gets one per `build.gradle`.
 */
export function detectGradleManifests(repoFiles: readonly string[]): ManifestLocation[] {
  const settingsFiles = repoFiles.filter((filePath) =>
    SETTINGS_FILENAMES.has(path.basename(filePath)),
  );
  if (settingsFiles.length > 0) {
    return firstPathPerDirectory(settingsFiles);
  }
  return firstPathPerDirectory(
    repoFiles.filter((filePath) => BUILD_FILENAMES.has(path.basename(filePath))),
  );
}

function isUnderRoot(filePath: string, rootDirectory: string): boolean {
  return (
    rootDirectory === '.' || filePath === rootDirectory || filePath.startsWith(`${rootDirectory}/`)
  );
}

export function findBuildFiles(repoFiles: readonly string[], rootDirectory: string): string[] {
  return repoFiles.filter(
    (filePath) =>
      BUILD_FILENAMES.has(path.basename(filePath)) && isUnderRoot(filePath, rootDirectory),
  );
}

export function hasVersionCatalog(repoFiles: readonly string[], rootDirectory: string): boolean {
  const catalogPath = path.join(rootDirectory, 'gradle', 'libs.versions.toml');
  return repoFiles.includes(catalogPath);
}

export function hasDependencyLocking(repoFiles: readonly string[], rootDirectory: string): boolean {
  return repoFiles.some(
    (filePath) =>
      path.basename(filePath) === 'gradle.lockfile' && isUnderRoot(filePath, rootDirectory),
  );
}
