import { parseTagVersion } from './action-tags.js';

/**
 * One `uses: owner/repo[/path]@ref` line in a workflow or composite action file. `version` is the
 * tag this line is on: the ref itself (`@v4.1.0`), or, for a ref pinned to a commit SHA, the
 * version in its trailing comment (`@<sha> # v4.1.0`), the convention every SHA-pinning tool
 * writes. Null when there is no version to compare against (a branch, a bare SHA).
 */
export interface ActionRef {
  readonly repo: string;
  readonly ref: string;
  readonly pinnedSha: string | null;
  readonly version: string | null;
}

/** What one ref should be rewritten to; `sha` is required when the ref is pinned to a SHA. */
export interface RefRewrite {
  readonly version: string;
  readonly sha: string | null;
}

// prefix, quote, owner/repo, optional subpath (a monorepo action or reusable workflow), ref,
// closing quote, and whatever follows (spacing and an optional comment).
const USES_LINE =
  /^(\s*(?:-\s+)?uses:\s+)(["']?)([\w.-]+\/[\w.-]+)((?:\/[^@\s"']*)?)@([\w./-]+)\2(.*)$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
// "# v4.1.0", "# tag=v4.1.0", "# pin @v4.1.0": the version is the first tag-shaped word.
const COMMENT_VERSION = /^\s+#\s*(?:.*?[\s=@:])?(v?\d+(?:\.\d+){0,2})(?![\w.-])/;

interface ParsedLine {
  readonly prefix: string;
  readonly quote: string;
  readonly repo: string;
  readonly subpath: string;
  readonly ref: string;
  readonly rest: string;
}

function parseLine(line: string): ParsedLine | null {
  const match = USES_LINE.exec(line);
  if (!match) {
    return null;
  }
  const [, prefix = '', quote = '', repo = '', subpath = '', ref = '', rest = ''] = match;
  return { prefix, quote, repo, subpath, ref, rest };
}

function toActionRef(parsed: ParsedLine): ActionRef {
  if (!COMMIT_SHA.test(parsed.ref)) {
    const version = parseTagVersion(parsed.ref) ? parsed.ref : null;
    return { repo: parsed.repo, ref: parsed.ref, pinnedSha: null, version };
  }
  const commentVersion = COMMENT_VERSION.exec(parsed.rest)?.[1] ?? null;
  return { repo: parsed.repo, ref: parsed.ref, pinnedSha: parsed.ref, version: commentVersion };
}

/** Every remote action reference in `contents`. Local (`./path`) and `docker://` references
 * never match, they have no tags to update. */
export function parseActionRefs(contents: string): ActionRef[] {
  return contents
    .split('\n')
    .map((line) => parseLine(line))
    .filter((parsed): parsed is ParsedLine => parsed !== null)
    .map((parsed) => toActionRef(parsed));
}

/**
 * Rewrites every ref `decide` returns a rewrite for, touching only the ref and, for a SHA-pinned
 * ref, the version in its comment. Indentation, quoting, the subpath, and the rest of the
 * comment are kept byte for byte, so the diff is exactly the version change.
 */
export function rewriteActionRefs(
  contents: string,
  decide: (ref: ActionRef) => RefRewrite | null,
): string {
  return contents
    .split('\n')
    .map((line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return line;
      }
      const actionRef = toActionRef(parsed);
      const rewrite = decide(actionRef);
      return rewrite ? renderLine(parsed, actionRef, rewrite) : line;
    })
    .join('\n');
}

function renderLine(parsed: ParsedLine, actionRef: ActionRef, rewrite: RefRewrite): string {
  const { prefix, quote, repo, subpath } = parsed;
  if (actionRef.pinnedSha === null || actionRef.version === null) {
    return `${prefix}${quote}${repo}${subpath}@${rewrite.version}${quote}${parsed.rest}`;
  }
  const rest = parsed.rest.replace(actionRef.version, rewrite.version);
  return `${prefix}${quote}${repo}${subpath}@${rewrite.sha ?? parsed.ref}${quote}${rest}`;
}
