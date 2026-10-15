import type { UpdateMode } from '../../types/ecosystem-plugin.js';

/**
 * A version-shaped tag: `v4`, `v4.1`, `v4.1.0`, or the same without the `v`. Anything else (a
 * branch, a pre-release tag like `v5.0.0-beta.1`) isn't one, so it is never picked as a target.
 */
export interface TagVersion {
  readonly prefix: string;
  readonly parts: readonly number[];
}

const TAG_VERSION = /^(v?)(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

export function parseTagVersion(tag: string): TagVersion | null {
  const match = TAG_VERSION.exec(tag);
  if (!match) {
    return null;
  }
  const parts = match
    .slice(2)
    .filter((part): part is string => part !== undefined)
    .map(Number);
  return { prefix: match[1] ?? '', parts };
}

/** Same `v` prefix and same precision: `v4` only ever moves to another major-only tag, `v4.1.0`
 * to another full version, so a floating ref never silently becomes a fixed one or the reverse. */
export function isSameTagShape(a: TagVersion, b: TagVersion): boolean {
  return a.prefix === b.prefix && a.parts.length === b.parts.length;
}

function compareParts(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * The newest tag of the same shape as `current`, newer than it, and within its major unless
 * `mode` is breaking. Null when `current` is already the newest it can move to.
 */
export function pickTargetTag(
  current: string,
  tags: Iterable<string>,
  mode: UpdateMode,
): string | null {
  const currentVersion = parseTagVersion(current);
  if (!currentVersion) {
    return null;
  }

  let best: { tag: string; version: TagVersion } = { tag: current, version: currentVersion };
  for (const tag of tags) {
    const version = parseTagVersion(tag);
    if (!version || !isSameTagShape(version, currentVersion)) {
      continue;
    }
    if (mode === 'non-breaking' && version.parts[0] !== currentVersion.parts[0]) {
      continue;
    }
    if (compareParts(version.parts, best.version.parts) > 0) {
      best = { tag, version };
    }
  }
  return best.tag === current ? null : best.tag;
}
