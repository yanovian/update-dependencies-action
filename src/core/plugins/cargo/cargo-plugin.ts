import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runPinCommand, runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import { readFileIfPresent } from '../../util/read-file-if-present.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PinTarget,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { resolveCargoLockVersions } from './cargo-lockfile.js';
import {
  detectCargoManifests,
  parseCargoToml,
  readDirectDependencyNames,
} from './cargo-manifest.js';
import { bumpCargoTomlVersions } from './cargo-toml-writer.js';
import { fetchLatestCrateVersion } from './crates-io-client.js';

export function createCargoPlugin(): DependencyUpdatePlugin {
  return {
    id: 'cargo',
    language: 'Rust',
    detectManifests: detectCargoManifests,
    update: updateCargo,
    pinVersion: pinCargoVersion,
  };
}

/** `--precise` is cargo's own documented flag for pinning one crate to an exact version while
 * still letting it resolve the rest of the dependency graph normally. */
function pinCargoVersion(
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
): Promise<boolean> {
  const dir = path.join(ctx.repoRoot, location.directory);
  return runPinCommand(`cargo update -p ${target.name} --precise ${target.version}`, dir);
}

async function updateCargo(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);
  const lockfileAbsPath = path.join(dir, 'Cargo.lock');

  const declaredNames = readDirectDependencyNames(
    parseCargoToml(await readFile(manifestAbsPath, 'utf8')),
  );
  const before = await readLockVersions(lockfileAbsPath, declaredNames);

  // Cargo itself has no flag to ignore Cargo.toml's semver requirement, so breaking mode
  // rewrites the requirement to each crate's latest stable version first; `cargo update` then
  // does the same real dependency resolution either way.
  if (mode === 'breaking') {
    await rewriteToLatest(manifestAbsPath, declaredNames);
  }
  await runProcess('cargo update', { cwd: dir });

  const after = await readLockVersions(lockfileAbsPath, declaredNames);
  return {
    changes: diffVersions(before, after, 'cargo', location.directory),
    manualActionNeeded: [],
  };
}

async function readLockVersions(
  lockfileAbsPath: string,
  declaredNames: readonly string[],
): Promise<Map<string, string>> {
  const contents = await readFileIfPresent(lockfileAbsPath);
  return contents ? resolveCargoLockVersions(contents, declaredNames) : new Map();
}

async function rewriteToLatest(
  manifestAbsPath: string,
  declaredNames: readonly string[],
): Promise<void> {
  const updates = new Map<string, string>();
  for (const name of declaredNames) {
    const latest = await fetchLatestCrateVersion(name);
    if (latest) {
      updates.set(name, latest);
    }
  }
  if (updates.size === 0) {
    return;
  }
  const original = await readFile(manifestAbsPath, 'utf8');
  await writeFile(manifestAbsPath, bumpCargoTomlVersions(original, updates), 'utf8');
}
