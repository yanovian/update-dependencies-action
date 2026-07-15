import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { detectComposerManifests, readDeclaredPackageNames } from './composer-manifest.js';
import { resolveComposerLockVersions } from './composer-lockfile.js';
import { fetchOutdatedComposerPackages } from './composer-outdated.js';

export function createComposerPlugin(): DependencyUpdatePlugin {
  return {
    id: 'composer',
    language: 'PHP',
    detectManifests: detectComposerManifests,
    update: updateComposer,
  };
}

async function updateComposer(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);
  const lockfileAbsPath = path.join(dir, 'composer.lock');

  const declaredNames = readDeclaredPackageNames(
    JSON.parse(await readFile(manifestAbsPath, 'utf8')),
  );
  const before = resolveComposerLockVersions(
    await readFile(lockfileAbsPath, 'utf8'),
    declaredNames,
  );

  if (mode === 'breaking') {
    await requireLatestVersions(dir, declaredNames);
  } else {
    // composer.json's own constraints already cap this at non-breaking; no extra flag needed.
    await runProcess('composer update --with-all-dependencies', { cwd: dir });
  }

  const after = resolveComposerLockVersions(await readFile(lockfileAbsPath, 'utf8'), declaredNames);
  return {
    changes: diffVersions(before, after, 'composer', location.directory),
    manualActionNeeded: [],
  };
}

/** composer has no flag to ignore composer.json's constraints, so breaking mode looks up each
 * declared package's real latest version via `composer outdated` and re-requires it directly,
 * which is composer's own resolver call, in one batched invocation so it resolves everything
 * together instead of leaving the lockfile in an intermediate state between packages. */
async function requireLatestVersions(dir: string, declaredNames: readonly string[]): Promise<void> {
  const outdated = await fetchOutdatedComposerPackages(dir);
  const args = declaredNames
    .map((name) => outdated.get(name))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .map((entry) => `${entry.name}:^${entry.latest}`);

  if (args.length === 0) {
    return;
  }
  await runProcess(`composer require ${args.join(' ')} --with-all-dependencies`, { cwd: dir });
}
