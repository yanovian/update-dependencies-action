import path from 'node:path';
import { runPinCommand, runProcess } from '../../commands/run-process.js';
import { isMajorBump } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PackageChange,
  PinTarget,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { detectNuGetManifests } from './nuget-manifest.js';
import { fetchOutdatedNuGetPackages, type OutdatedNuGetPackage } from './nuget-outdated.js';

export function createNuGetPlugin(): DependencyUpdatePlugin {
  return {
    id: 'nuget',
    language: 'C#/.NET',
    detectManifests: detectNuGetManifests,
    update: updateNuGet,
    pinVersion: pinNuGetVersion,
  };
}

/** Same `dotnet add package` call `applyPackageUpdate` already makes, parameterized to an exact
 * version instead of the latest one. */
function pinNuGetVersion(
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
): Promise<boolean> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const projectFile = path.basename(location.manifestPath);
  return runPinCommand(
    `dotnet add "${projectFile}" package ${target.name} --version ${target.version}`,
    dir,
  );
}

async function updateNuGet(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const projectFile = path.basename(location.manifestPath);

  const outdated = await fetchOutdatedNuGetPackages(dir, projectFile);
  const candidates = [...outdated.values()].filter(
    (pkg) => mode === 'breaking' || !isMajorBump(pkg.resolvedVersion, pkg.latestVersion),
  );

  const changes: PackageChange[] = [];
  for (const pkg of candidates) {
    // `dotnet add package` only takes one package at a time, but it is the SDK's own real
    // resolver call, so it updates the project file and any packages.lock.json correctly.
    const change = await applyPackageUpdate({
      dir,
      projectFile,
      pkg,
      directoryPath: location.directory,
    });
    if (change) {
      changes.push(change);
    }
  }

  return { changes, manualActionNeeded: [] };
}

interface ApplyPackageUpdateOptions {
  readonly dir: string;
  readonly projectFile: string;
  readonly pkg: OutdatedNuGetPackage;
  readonly directoryPath: string;
}

async function applyPackageUpdate(
  options: ApplyPackageUpdateOptions,
): Promise<PackageChange | null> {
  const { dir, projectFile, pkg, directoryPath } = options;
  const result = await runProcess(
    `dotnet add "${projectFile}" package ${pkg.id} --version ${pkg.latestVersion}`,
    { cwd: dir, allowFailure: true },
  );
  if (result.exitCode !== 0) {
    return null;
  }
  return {
    ecosystem: 'nuget',
    path: directoryPath,
    name: pkg.id,
    fromVersion: pkg.resolvedVersion,
    toVersion: pkg.latestVersion,
    breaking: isMajorBump(pkg.resolvedVersion, pkg.latestVersion),
  };
}
