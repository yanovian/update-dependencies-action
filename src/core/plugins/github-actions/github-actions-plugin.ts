import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
import { isMajorBump } from '../../update/diff-versions.js';
import { isSameTagShape, parseTagVersion, pickTargetTag } from './action-tags.js';
import { detectGitHubActionsManifests, listActionFiles } from './github-actions-manifest.js';
import { listActionTags } from './github-tags-client.js';
import {
  parseActionRefs,
  rewriteActionRefs,
  type ActionRef,
  type RefRewrite,
} from './workflow-refs.js';

type TagLookup = (repo: string) => Promise<Map<string, string> | null>;

/**
 * Updates the `uses: owner/repo@ref` references in workflow files and composite actions. There
 * is no package manager to delegate to here, the ref is the whole declaration, so this rewrites
 * it directly, and only when it's a version-shaped tag (or a SHA with a version comment). A
 * branch ref is left alone on purpose, it already tracks whatever is newest.
 */
export function createGitHubActionsPlugin(
  lookupTags: TagLookup = listActionTags,
): DependencyUpdatePlugin {
  const tagCache = new Map<string, Promise<Map<string, string> | null>>();
  const cachedTags: TagLookup = (repo) => {
    const cached = tagCache.get(repo) ?? lookupTags(repo);
    tagCache.set(repo, cached);
    return cached;
  };

  return {
    id: 'github-actions',
    language: 'GitHub Actions',
    detectManifests: detectGitHubActionsManifests,
    update: (location, mode, ctx) => updateActionRefs(location, mode, ctx, cachedTags),
    pinVersion: (location, target, ctx) => pinActionRef(location, target, ctx, cachedTags),
  };
}

interface FileContents {
  readonly filePath: string;
  readonly contents: string;
}

async function readActionFiles(
  location: ManifestLocation,
  ctx: UpdateContext,
): Promise<FileContents[]> {
  const files = await listActionFiles(ctx.repoRoot, location);
  return Promise.all(
    files.map(async (filePath) => ({
      filePath,
      contents: await readFile(path.join(ctx.repoRoot, filePath), 'utf8'),
    })),
  );
}

/** Applies `decide` to every file, writing only the ones that actually changed. Returns whether
 * any did. */
async function rewriteFiles(
  files: readonly FileContents[],
  ctx: UpdateContext,
  decide: (ref: ActionRef) => RefRewrite | null,
): Promise<boolean> {
  let anyChanged = false;
  for (const { filePath, contents } of files) {
    const updated = rewriteActionRefs(contents, decide);
    if (updated !== contents) {
      await writeFile(path.join(ctx.repoRoot, filePath), updated, 'utf8');
      anyChanged = true;
    }
  }
  return anyChanged;
}

async function updateActionRefs(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
  lookupTags: TagLookup,
): Promise<PluginUpdateResult> {
  const files = await readActionFiles(location, ctx);
  const refs = files.flatMap((file) => parseActionRefs(file.contents));
  const repos = [...new Set(refs.filter((ref) => ref.version !== null).map((ref) => ref.repo))];
  const tagsByRepo = new Map(
    await Promise.all(repos.map(async (repo) => [repo, await lookupTags(repo)] as const)),
  );

  const changes = new Map<string, PackageChange>();
  await rewriteFiles(files, ctx, (ref) => {
    const rewrite = planRewrite(ref, tagsByRepo.get(ref.repo) ?? null, mode);
    if (rewrite && ref.version) {
      changes.set(`${ref.repo}@${ref.version}`, {
        ecosystem: 'github-actions',
        path: location.directory,
        name: ref.repo,
        fromVersion: ref.version,
        toVersion: rewrite.version,
        breaking: isMajorBump(ref.version, rewrite.version),
      });
    }
    return rewrite;
  });

  return {
    changes: [...changes.values()],
    manualActionNeeded: collectNotes(refs, tagsByRepo, location),
    // Every byte this plugin writes is a ref it chose to change and reported above.
    diskChangeExplained: true,
  };
}

function planRewrite(
  ref: ActionRef,
  tags: ReadonlyMap<string, string> | null,
  mode: UpdateMode,
): RefRewrite | null {
  if (!ref.version || !tags) {
    return null;
  }
  const target = pickTargetTag(ref.version, tags.keys(), mode);
  if (!target) {
    return null;
  }
  const sha = tags.get(target) ?? null;
  // A SHA-pinned ref must move to the new tag's own commit, never just get a new comment.
  return ref.pinnedSha && !sha ? null : { version: target, sha };
}

function collectNotes(
  refs: readonly ActionRef[],
  tagsByRepo: ReadonlyMap<string, Map<string, string> | null>,
  location: ManifestLocation,
): ManualNote[] {
  const notes = new Map<string, ManualNote>();
  const note = (name: string, reason: string): void => {
    notes.set(`${name}::${reason}`, {
      ecosystem: 'github-actions',
      path: location.directory,
      name,
      reason,
    });
  };

  for (const ref of refs) {
    if (ref.pinnedSha && !ref.version) {
      note(
        ref.repo,
        `Pinned to commit ${ref.pinnedSha.slice(0, 12)} with no version comment, so there is ` +
          'no version to compare against. Add the tag as a comment after the SHA ' +
          '(for example `@<sha> # v4.1.0`) to have it kept up to date.',
      );
    } else if (ref.version && tagsByRepo.get(ref.repo) === null) {
      note(
        ref.repo,
        'Could not list its tags from the GitHub API (rate limited, or a private, renamed, or ' +
          'unreachable repository), so it was not checked this run. It will be retried next run.',
      );
    }
  }
  return [...notes.values()];
}

/**
 * Used by the release-age and stable-version gates to walk a change back. Only pins to a tag of
 * the same shape as what's on disk: walking `v5` back to `v5.0.1` would quietly turn a floating
 * ref into a fixed one, so that returns false and the gate flags the change instead.
 */
async function pinActionRef(
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
  lookupTags: TagLookup,
): Promise<boolean> {
  const current = parseTagVersion(target.fromVersion);
  const wanted = parseTagVersion(target.version);
  if (!current || !wanted || !isSameTagShape(current, wanted)) {
    return false;
  }

  const files = await readActionFiles(location, ctx);
  const tags = await lookupTags(target.name);
  let missingSha = false;
  const changed = await rewriteFiles(files, ctx, (ref) => {
    if (ref.repo !== target.name || ref.version !== target.fromVersion) {
      return null;
    }
    const sha = ref.pinnedSha ? (tags?.get(target.version) ?? null) : null;
    if (ref.pinnedSha && !sha) {
      missingSha = true;
      return null;
    }
    return { version: target.version, sha };
  });
  return changed && !missingSha;
}
