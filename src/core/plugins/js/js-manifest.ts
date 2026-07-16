import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import type { Logger } from '../../logging/logger.js';
import { readFileIfPresent } from '../../util/read-file-if-present.js';
import type {
  EcosystemId,
  ManifestLocation,
  ManualNote,
  PluginUpdateResult,
  UpdateContext,
} from '../../types/ecosystem-plugin.js';

interface PackageJsonShape {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

export function toManifestLocation(
  manifestPath: string,
  ecosystem: EcosystemId,
  language: string,
): ManifestLocation {
  return { ecosystem, language, manifestPath, directory: path.dirname(manifestPath) };
}

/** npm is the fallback for any package.json that isn't claimed by Yarn or pnpm's own lockfile,
 * including the no-lockfile-yet case, so exactly one plugin ever claims a given directory. */
export function detectNpmManifests(repoFiles: readonly string[]): ManifestLocation[] {
  const repoFileSet = new Set(repoFiles);
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'package.json')
    .filter((manifestPath) => {
      const dir = path.dirname(manifestPath);
      const hasYarnLock = repoFileSet.has(path.join(dir, 'yarn.lock'));
      const hasPnpmLock = repoFileSet.has(path.join(dir, 'pnpm-lock.yaml'));
      return !hasYarnLock && !hasPnpmLock;
    })
    .map((manifestPath) => toManifestLocation(manifestPath, 'npm', 'JavaScript/TypeScript'));
}

export function detectJsManifests(
  repoFiles: readonly string[],
  ecosystem: EcosystemId,
  lockfileName: string,
): ManifestLocation[] {
  const repoFileSet = new Set(repoFiles);
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'package.json')
    .filter((manifestPath) => repoFileSet.has(path.join(path.dirname(manifestPath), lockfileName)))
    .map((manifestPath) => toManifestLocation(manifestPath, ecosystem, 'JavaScript/TypeScript'));
}

export async function readDeclaredDependencies(
  manifestAbsPath: string,
): Promise<Map<string, string>> {
  const packageJson = JSON.parse(await readFile(manifestAbsPath, 'utf8')) as PackageJsonShape;
  return new Map(Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies }));
}

type ResolveVersions = (
  lockfileContents: string,
  declared: ReadonlyMap<string, string>,
) => Map<string, string>;

export interface JsUpdateOptions {
  readonly ecosystem: EcosystemId;
  readonly location: ManifestLocation;
  readonly ctx: UpdateContext;
  readonly lockfileName: string;
  readonly command: string;
  readonly resolveVersions: ResolveVersions;
}

/** Shared by every JS package manager plugin: snapshot resolved versions from the lockfile,
 * run that manager's own real update command so its own resolver writes the lockfile, snapshot
 * again, and diff. Never hand-edits a lockfile. */
export async function runJsUpdate(options: JsUpdateOptions): Promise<PluginUpdateResult> {
  const { ecosystem, location, ctx, lockfileName, command, resolveVersions } = options;
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);
  const lockfileAbsPath = path.join(dir, lockfileName);

  const declared = await readDeclaredDependencies(manifestAbsPath);
  const readOptions = { lockfileAbsPath, declared, resolveVersions, logger: ctx.logger };
  const before = await readVersionsIfPresent({ ...readOptions, label: 'Before update' });

  await runProcess(command, { cwd: dir });

  const after = await readVersionsIfPresent({ ...readOptions, label: 'After update' });
  ctx.logger.info(formatVersionComparison(location.directory, before.versions, after.versions));
  const changes = diffVersions(before.versions, after.versions, ecosystem, location.directory);

  // If resolution was ever incomplete, a "0 changes" diff isn't trustworthy: it may just mean
  // the lockfile doesn't match the manifest, not that nothing changed. Say so specifically here
  // rather than let update-repo's generic "files changed but no changes reported" fallback give
  // a vaguer answer.
  if (changes.length === 0 && (!before.complete || !after.complete)) {
    return {
      changes,
      manualActionNeeded: [
        buildUnresolvedNote(
          ecosystem,
          location.directory,
          path.basename(manifestAbsPath),
          lockfileName,
        ),
      ],
    };
  }

  // A package manager can rewrite package.json's own declared range (e.g. "^19.2.0" to
  // "^19.2.7") without the resolved version moving, already satisfied the old range. That's a
  // real, visible file change a reader would otherwise have no explanation for, so report it
  // too, tagged indirect, for any name not already covered by a real resolved-version change
  // above.
  const alreadyReported = new Set(changes.map((change) => change.name));
  const declaredAfter = await readDeclaredDependencies(manifestAbsPath);
  const rangeChanges = diffVersions(declared, declaredAfter, ecosystem, location.directory)
    .filter((change) => !alreadyReported.has(change.name))
    .map((change) => ({ ...change, indirect: true }));

  // Resolution was complete on both sides: whatever's in `changes` (even an empty list) is a
  // real, confident answer, the manifest/lockfile bytes may still have changed on disk
  // (reformatting, metadata churn) with no version actually moving, so tell the orchestrator not
  // to second-guess this with its own generic disk-diff check, which has no way to know this
  // plugin already looked.
  return {
    changes: [...changes, ...rangeChanges],
    manualActionNeeded: [],
    diskChangeExplained: true,
  };
}

/** Printed unconditionally, not just when something looks wrong, so "nothing changed" is always
 * a visible, checkable claim (here's every package this Action compared, and what it saw on
 * each side) instead of something you have to trust blind. */
function formatVersionComparison(
  directory: string,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string {
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const lines = names.map(
    (name) =>
      `  ${name}: ${before.get(name) ?? '(unresolved)'} -> ${after.get(name) ?? '(unresolved)'}`,
  );
  return [`Resolved versions compared in ${directory}:`, ...lines].join('\n');
}

function buildUnresolvedNote(
  ecosystem: EcosystemId,
  directory: string,
  manifestFilename: string,
  lockfileName: string,
): ManualNote {
  return {
    ecosystem,
    path: directory,
    name: null,
    reason:
      `${lockfileName} doesn't list every dependency ${manifestFilename} declares, so version ` +
      "changes here couldn't be confirmed. This usually means the lockfile is out of sync with " +
      'the manifest (see the "Unresolved" warning in the Action log for exactly which ' +
      'dependencies), regenerate the lockfile in this directory to fix it.',
  };
}

interface ReadVersionsOptions {
  readonly lockfileAbsPath: string;
  readonly declared: ReadonlyMap<string, string>;
  readonly resolveVersions: ResolveVersions;
  readonly logger: Logger;
  readonly label: string;
}

interface VersionSnapshot {
  readonly versions: Map<string, string>;
  /** False when the lockfile resolved fewer of the declared dependencies than expected, the
   * signal that a resulting "0 changes" diff isn't a confident answer. */
  readonly complete: boolean;
}

/**
 * Reads and parses the lockfile, and, if it resolved fewer of the declared dependencies than
 * expected, logs enough of the lockfile's own shape (not just "0 changes found") to diagnose a
 * lockfile format this Action's parser doesn't handle, rather than let that failure look
 * identical to "nothing needed updating".
 */
async function readVersionsIfPresent(options: ReadVersionsOptions): Promise<VersionSnapshot> {
  const { lockfileAbsPath, declared, resolveVersions, logger, label } = options;
  const contents = await readFileIfPresent(lockfileAbsPath);
  if (contents === null) {
    return { versions: new Map(), complete: declared.size === 0 };
  }

  const resolved = resolveVersions(contents, declared);
  if (resolved.size < declared.size) {
    const unresolved = [...declared.keys()].filter((name) => !resolved.has(name));
    logger.warn(
      `${label}: resolved ${resolved.size}/${declared.size} declared dependencies from ` +
        `${path.basename(lockfileAbsPath)}. Unresolved: ${unresolved.join(', ')}. ` +
        `Lockfile starts with: ${contents.slice(0, 400).replace(/\n/g, ' | ')}`,
    );
  }
  return { versions: resolved, complete: resolved.size === declared.size };
}
