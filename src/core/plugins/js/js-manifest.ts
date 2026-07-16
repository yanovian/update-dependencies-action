import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import type { Logger } from '../../logging/logger.js';
import { readFileIfPresent } from '../../util/read-file-if-present.js';
import type {
  EcosystemId,
  ManifestLocation,
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
  return {
    changes: diffVersions(before, after, ecosystem, location.directory),
    manualActionNeeded: [],
  };
}

interface ReadVersionsOptions {
  readonly lockfileAbsPath: string;
  readonly declared: ReadonlyMap<string, string>;
  readonly resolveVersions: ResolveVersions;
  readonly logger: Logger;
  readonly label: string;
}

/**
 * Reads and parses the lockfile, and, if it resolved fewer of the declared dependencies than
 * expected, logs enough of the lockfile's own shape (not just "0 changes found") to diagnose a
 * lockfile format this Action's parser doesn't handle, rather than let that failure look
 * identical to "nothing needed updating".
 */
async function readVersionsIfPresent(options: ReadVersionsOptions): Promise<Map<string, string>> {
  const { lockfileAbsPath, declared, resolveVersions, logger, label } = options;
  const contents = await readFileIfPresent(lockfileAbsPath);
  if (contents === null) {
    return new Map();
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
  return resolved;
}
