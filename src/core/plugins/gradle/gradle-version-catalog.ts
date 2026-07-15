import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { isMajorBump } from '../../update/diff-versions.js';
import {
  emptyRewriteResult,
  type RewriteResult,
  type UpdateCandidate,
} from './gradle-rewrite-result.js';

interface CatalogLibraryValue {
  module?: string;
  group?: string;
  name?: string;
  version?: string | { ref?: string };
}

interface CatalogShape {
  versions?: Record<string, string>;
  libraries?: Record<string, CatalogLibraryValue | string>;
}

interface RewriteCtx {
  readonly candidates: ReadonlyMap<string, UpdateCandidate>;
  readonly directoryPath: string;
  readonly result: ReturnType<typeof emptyRewriteResult>;
}

function groupArtifactOf(lib: CatalogLibraryValue): string | null {
  if (lib.module) {
    return lib.module;
  }
  return lib.group && lib.name ? `${lib.group}:${lib.name}` : null;
}

function recordChange(ctx: RewriteCtx, groupArtifact: string, candidate: UpdateCandidate): void {
  ctx.result.changes.push({
    ecosystem: 'gradle',
    path: ctx.directoryPath,
    name: groupArtifact,
    fromVersion: candidate.from,
    toVersion: candidate.to,
    breaking: isMajorBump(candidate.from, candidate.to),
  });
  ctx.result.appliedGroupArtifacts.add(groupArtifact);
}

function applyShorthand(
  alias: string,
  value: string,
  libraries: Record<string, CatalogLibraryValue | string>,
  ctx: RewriteCtx,
): void {
  const parts = value.split(':');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    return;
  }
  const groupArtifact = `${parts[0]}:${parts[1]}`;
  const candidate = ctx.candidates.get(groupArtifact);
  if (!candidate) {
    return;
  }
  libraries[alias] = `${parts[0]}:${parts[1]}:${candidate.to}`;
  recordChange(ctx, groupArtifact, candidate);
}

function applyStructuredLibrary(
  alias: string,
  lib: CatalogLibraryValue,
  versions: Record<string, string>,
  ctx: RewriteCtx,
): void {
  const groupArtifact = groupArtifactOf(lib);
  const candidate = groupArtifact ? ctx.candidates.get(groupArtifact) : undefined;
  if (!groupArtifact || !candidate) {
    return;
  }

  if (typeof lib.version === 'string') {
    lib.version = candidate.to;
    recordChange(ctx, groupArtifact, candidate);
    return;
  }

  const versionRef = lib.version?.ref;
  if (versionRef && versionRef in versions) {
    versions[versionRef] = candidate.to;
    recordChange(ctx, groupArtifact, candidate);
    return;
  }

  ctx.result.manualActionNeeded.push({
    ecosystem: 'gradle',
    path: ctx.directoryPath,
    name: groupArtifact,
    reason: `Declared in the version catalog as "${alias}" in a form this Action doesn't rewrite automatically.`,
  });
}

/**
 * Rewrites `gradle/libs.versions.toml` in place through smol-toml, the same structured-edit
 * approach as Cargo.toml. Only the forms the Gradle docs recommend are handled: a shorthand
 * "group:artifact:version" string, a literal `version = "..."`, and `version.ref` pointing at
 * the `[versions]` table. Anything else becomes a manual-action note instead of a guess.
 */
export function rewriteVersionCatalog(
  original: string,
  candidates: ReadonlyMap<string, UpdateCandidate>,
  directoryPath: string,
): { content: string } & RewriteResult {
  const parsed = parseToml(original) as CatalogShape;
  const versions = { ...parsed.versions };
  const libraries = { ...parsed.libraries };
  const ctx: RewriteCtx = { candidates, directoryPath, result: emptyRewriteResult() };

  for (const [alias, lib] of Object.entries(libraries)) {
    if (typeof lib === 'string') {
      applyShorthand(alias, lib, libraries, ctx);
    } else {
      applyStructuredLibrary(alias, lib, versions, ctx);
    }
  }

  return { content: stringifyToml({ ...parsed, versions, libraries }), ...ctx.result };
}
