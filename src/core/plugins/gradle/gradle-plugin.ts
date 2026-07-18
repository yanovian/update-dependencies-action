import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listRepoFiles } from '../../discovery/list-repo-files.js';
import { isMajorBump } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  ManualNote,
  PackageChange,
  PinTarget,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { rewriteBuildFile } from './gradle-build-file.js';
import { refreshDependencyLocksIfEnabled } from './gradle-lockfile.js';
import { detectGradleManifests, findBuildFiles, hasVersionCatalog } from './gradle-manifest.js';
import { fetchOutdatedGradleDependencies, resolveGradleCommand } from './gradle-report.js';
import type { RewriteResult, UpdateCandidate } from './gradle-rewrite-result.js';
import { isVersionRefShared, rewriteVersionCatalog } from './gradle-version-catalog.js';

export function createGradlePlugin(): DependencyUpdatePlugin {
  return {
    id: 'gradle',
    language: 'Java/JVM (Gradle)',
    detectManifests: detectGradleManifests,
    update: updateGradle,
    pinVersion: pinGradleVersion,
  };
}

/**
 * Rewrites the same declaration `updateGradle` just wrote, one more time, to the compliant
 * version. `target.fromVersion` is what the gate already knows is on disk right now (this run's
 * own too-fresh resolution), so both rewriters below can target the declaration directly instead
 * of re-deriving it by re-parsing the file.
 */
async function pinGradleVersion(
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
): Promise<boolean> {
  const repoFiles = await listRepoFiles(ctx.repoRoot);
  const dir: PinDirectory = { repoRoot: ctx.repoRoot, directory: location.directory };
  const applied = hasVersionCatalog(repoFiles, location.directory)
    ? await pinInVersionCatalog(dir, target)
    : await pinInBuildFiles(dir, repoFiles, target);

  if (applied) {
    const absDir = path.join(dir.repoRoot, dir.directory);
    const gradleCommand = await resolveGradleCommand(absDir);
    await refreshDependencyLocksIfEnabled(absDir, gradleCommand, ctx.logger);
  }
  return applied;
}

interface PinDirectory {
  readonly repoRoot: string;
  readonly directory: string;
}

async function pinInVersionCatalog(dir: PinDirectory, target: PinTarget): Promise<boolean> {
  const catalogPath = path.join(dir.repoRoot, dir.directory, 'gradle', 'libs.versions.toml');
  const original = await readFile(catalogPath, 'utf8');

  // A version declared via `version.ref` can be shared by more than one library; rewriting it
  // for just this one dependency would silently move every other library on the same alias too,
  // so this declines rather than risk corrupting a sibling's version.
  if (isVersionRefShared(original, target.name)) {
    return false;
  }

  const candidates = new Map<string, UpdateCandidate>([
    [target.name, { from: target.fromVersion, to: target.version }],
  ]);
  const rewrite = rewriteVersionCatalog(original, candidates, dir.directory);
  if (rewrite.appliedGroupArtifacts.size === 0) {
    return false;
  }
  await writeFile(catalogPath, rewrite.content, 'utf8');
  return true;
}

async function pinInBuildFiles(
  dir: PinDirectory,
  repoFiles: readonly string[],
  target: PinTarget,
): Promise<boolean> {
  const candidates = new Map<string, UpdateCandidate>([
    [target.name, { from: target.fromVersion, to: target.version }],
  ]);

  let applied = false;
  for (const buildFilePath of findBuildFiles(repoFiles, dir.directory)) {
    const absPath = path.join(dir.repoRoot, buildFilePath);
    const original = await readFile(absPath, 'utf8');
    const rewrite = rewriteBuildFile(original, candidates, dir.directory);
    if (rewrite.appliedGroupArtifacts.size > 0) {
      await writeFile(absPath, rewrite.content, 'utf8');
      applied = true;
    }
  }
  return applied;
}

async function updateGradle(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const outdated = await fetchOutdatedGradleDependencies(dir);
  const candidates = buildCandidateMap(outdated, mode);
  if (candidates.size === 0) {
    return { changes: [], manualActionNeeded: [] };
  }

  const repoFiles = await listRepoFiles(ctx.repoRoot);
  const rewrite = hasVersionCatalog(repoFiles, location.directory)
    ? await applyVersionCatalog(ctx.repoRoot, location.directory, candidates)
    : await applyBuildFiles(ctx.repoRoot, repoFiles, location.directory, candidates);

  const gradleCommand = await resolveGradleCommand(dir);
  await refreshDependencyLocksIfEnabled(dir, gradleCommand, ctx.logger);

  return {
    changes: rewrite.changes,
    manualActionNeeded: [
      ...rewrite.manualActionNeeded,
      ...unmatchedNotes(candidates, rewrite, location.directory),
    ],
  };
}

function buildCandidateMap(
  outdated: readonly { groupArtifact: string; currentVersion: string; latestVersion: string }[],
  mode: UpdateMode,
): Map<string, UpdateCandidate> {
  const candidates = new Map<string, UpdateCandidate>();
  for (const dependency of outdated) {
    const breaking = isMajorBump(dependency.currentVersion, dependency.latestVersion);
    if (mode === 'non-breaking' && breaking) {
      continue;
    }
    if (dependency.currentVersion !== dependency.latestVersion) {
      candidates.set(dependency.groupArtifact, {
        from: dependency.currentVersion,
        to: dependency.latestVersion,
      });
    }
  }
  return candidates;
}

async function applyVersionCatalog(
  repoRoot: string,
  directory: string,
  candidates: ReadonlyMap<string, UpdateCandidate>,
): Promise<RewriteResult> {
  const catalogPath = path.join(repoRoot, directory, 'gradle', 'libs.versions.toml');
  const original = await readFile(catalogPath, 'utf8');
  const { content, ...result } = rewriteVersionCatalog(original, candidates, directory);
  if (result.changes.length > 0) {
    await writeFile(catalogPath, content, 'utf8');
  }
  return result;
}

async function applyBuildFiles(
  repoRoot: string,
  repoFiles: readonly string[],
  directory: string,
  candidates: ReadonlyMap<string, UpdateCandidate>,
): Promise<RewriteResult> {
  const buildFiles = findBuildFiles(repoFiles, directory);
  const changes: PackageChange[] = [];
  const manualActionNeeded: ManualNote[] = [];
  const appliedGroupArtifacts = new Set<string>();

  for (const buildFilePath of buildFiles) {
    const absPath = path.join(repoRoot, buildFilePath);
    const original = await readFile(absPath, 'utf8');
    const rewritten = rewriteBuildFile(original, candidates, directory);
    if (rewritten.changes.length > 0) {
      await writeFile(absPath, rewritten.content, 'utf8');
    }
    changes.push(...rewritten.changes);
    manualActionNeeded.push(...rewritten.manualActionNeeded);
    for (const groupArtifact of rewritten.appliedGroupArtifacts) {
      appliedGroupArtifacts.add(groupArtifact);
    }
  }

  return { changes, manualActionNeeded, appliedGroupArtifacts };
}

function unmatchedNotes(
  candidates: ReadonlyMap<string, UpdateCandidate>,
  rewrite: RewriteResult,
  directoryPath: string,
): ManualNote[] {
  const notes: ManualNote[] = [];
  for (const [groupArtifact] of candidates) {
    if (!rewrite.appliedGroupArtifacts.has(groupArtifact)) {
      notes.push({
        ecosystem: 'gradle',
        path: directoryPath,
        name: groupArtifact,
        reason:
          'A newer version was found but this Action could not confidently locate its declaration to rewrite it.',
      });
    }
  }
  return notes;
}
