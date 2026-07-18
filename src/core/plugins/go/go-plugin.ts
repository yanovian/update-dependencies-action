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
import { detectGoManifests, directRequirementVersions } from './go-manifest.js';
import { detectNewerMajors } from './go-major-check.js';

export function createGoPlugin(): DependencyUpdatePlugin {
  return {
    id: 'go',
    language: 'Go',
    detectManifests: detectGoManifests,
    update: updateGoModule,
    pinVersion: pinGoVersion,
  };
}

/** `go get module@version` is Go's own documented way to pin one module to an exact version;
 * `go mod tidy` afterward keeps go.sum consistent, same as `updateGoModule` already does. */
async function pinGoVersion(
  location: ManifestLocation,
  name: string,
  version: string,
  ctx: UpdateContext,
): Promise<boolean> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const getResult = await runProcess(`go get ${name}@${version}`, { cwd: dir, allowFailure: true });
  if (getResult.exitCode !== 0) {
    return false;
  }
  const tidyResult = await runProcess('go mod tidy', { cwd: dir, allowFailure: true });
  return tidyResult.exitCode === 0;
}

/**
 * `go get -u` never crosses a major version boundary on its own, since a new major is a
 * different module path in Go's own convention; both non-breaking and breaking mode run the
 * same commands here for that reason, see go-major-check.ts for how a truly newer major is
 * surfaced instead of silently ignored.
 */
async function updateGoModule(
  location: ManifestLocation,
  _mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);

  const before = directRequirementVersions(await readFile(manifestAbsPath, 'utf8'));

  await runProcess('go get -u ./...', { cwd: dir });
  await runProcess('go mod tidy', { cwd: dir });

  const after = directRequirementVersions(await readFile(manifestAbsPath, 'utf8'));
  const changes = diffVersions(before, after, 'go', location.directory);
  const manualActionNeeded = await detectNewerMajors(after, location.directory);

  return { changes, manualActionNeeded };
}
