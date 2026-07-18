import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPinCommand, runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PinTarget,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { detectMavenManifests, readDependencyVersions } from './maven-manifest.js';

// Pinned so a Maven Central outage or breaking plugin release can't silently change behavior.
const VERSIONS_PLUGIN = 'org.codehaus.mojo:versions-maven-plugin:2.16.2';

export function createMavenPlugin(): DependencyUpdatePlugin {
  return {
    id: 'maven',
    language: 'Java/JVM',
    detectManifests: detectMavenManifests,
    update: updateMaven,
    pinVersion: pinMavenVersion,
  };
}

/** `use-dep-version` is versions-maven-plugin's own goal for forcing one dependency to an exact
 * version; `-DforceVersion=true` is required since the release-age gate can ask for an older
 * version than what's currently declared, which the plugin otherwise refuses as a downgrade. */
function pinMavenVersion(
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
): Promise<boolean> {
  const dir = path.join(ctx.repoRoot, location.directory);
  return runPinCommand(
    `mvn -B ${VERSIONS_PLUGIN}:use-dep-version -Dincludes=${target.name} ` +
      `-DdepVersion=${target.version} -DforceVersion=true ${VERSIONS_PLUGIN}:commit`,
    dir,
  );
}

async function updateMaven(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);

  const before = readDependencyVersions(await readFile(manifestAbsPath, 'utf8'));

  // Invoked by full GAV coordinate, so the plugin runs without the repo's own pom.xml
  // declaring it. `:commit` removes the .versionsBackup file versions-maven-plugin leaves behind.
  const allowMajorUpdates = mode === 'breaking';
  await runProcess(
    `mvn -B ${VERSIONS_PLUGIN}:use-latest-releases -DallowMajorUpdates=${allowMajorUpdates} ${VERSIONS_PLUGIN}:commit`,
    { cwd: dir },
  );

  const after = readDependencyVersions(await readFile(manifestAbsPath, 'utf8'));
  return {
    changes: diffVersions(before, after, 'maven', location.directory),
    manualActionNeeded: [],
  };
}
