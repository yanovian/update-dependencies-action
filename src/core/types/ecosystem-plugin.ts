import type { Logger } from '../logging/logger.js';

export const ALL_ECOSYSTEM_IDS = [
  'npm',
  'yarn',
  'pnpm',
  'pip',
  'cargo',
  'go',
  'maven',
  'gradle',
  'rubygems',
  'composer',
  'nuget',
] as const;

export type EcosystemId = (typeof ALL_ECOSYSTEM_IDS)[number];

export type UpdateMode = 'non-breaking' | 'breaking';

/** One manifest file this Action found, and the directory commands for it should run from. */
export interface ManifestLocation {
  readonly ecosystem: EcosystemId;
  readonly language: string;
  readonly manifestPath: string;
  readonly directory: string;
}

export interface PackageChange {
  readonly ecosystem: EcosystemId;
  readonly path: string;
  readonly name: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly breaking: boolean;
  /** True when only the declared version range changed (e.g. package.json's specifier), with
   * the resolved, actually-installed version unaffected. Absent/false means a real, direct
   * version change. */
  readonly indirect?: boolean;
}

/**
 * Something a plugin found but deliberately left alone, with a human-readable reason. The
 * generic escape hatch every plugin can use instead of a one-off type per edge case: e.g. a Go
 * module with a new major version available (crossing that boundary means changing import
 * paths, a code change, not a dependency bump), or a Gradle dependency declared in a form the
 * rewriter doesn't confidently recognize.
 */
export interface ManualNote {
  readonly ecosystem: EcosystemId;
  readonly path: string;
  readonly name: string | null;
  readonly reason: string;
}

export interface PluginUpdateResult {
  readonly changes: PackageChange[];
  readonly manualActionNeeded: ManualNote[];
  /**
   * True when the plugin itself already confidently determined nothing meaningful changed, even
   * if the manifest or lockfile's bytes did (reformatting, metadata churn). Without this,
   * "0 changes, 0 notes" looks identical whether a plugin confidently checked and found nothing,
   * or has no idea, so the orchestrator's own disk-diff safety net (see update-repo.ts) would
   * re-flag a case a plugin already resolved, defeating the point of it doing that work itself.
   * Most plugins never set this and get the safety net as before.
   */
  readonly diskChangeExplained?: boolean;
}

export interface UpdateContext {
  readonly repoRoot: string;
  readonly logger: Logger;
}

/** What `pinVersion` should change one dependency to, and what it's currently declared at.
 * Carrying `fromVersion` lets a plugin whose rewriter needs to match the current declaration
 * (e.g. Gradle's plain build-file notation) target it directly, instead of re-deriving it by
 * re-reading and re-parsing the file its own `update()` just wrote. */
export interface PinTarget {
  readonly name: string;
  readonly fromVersion: string;
  readonly version: string;
}

export interface DependencyUpdatePlugin {
  readonly id: EcosystemId;
  readonly language: string;
  detectManifests(repoFiles: readonly string[]): ManifestLocation[];
  update(
    location: ManifestLocation,
    mode: UpdateMode,
    ctx: UpdateContext,
  ): Promise<PluginUpdateResult>;
  /**
   * Re-pin one already-updated dependency to an exact version, used by the release-age gate
   * (see src/core/security/release-age-gate.ts) to walk a too-fresh resolution back to the
   * newest version old enough to satisfy the configured minimum age. Optional: a plugin that
   * can't cleanly pin a single dependency to an arbitrary version (RubyGems, whose resolver has
   * no such command without editing the Gemfile) omits this and the gate falls back to flagging
   * the change instead of adjusting it. Returns false (not a throw) on failure, since a failed
   * pin attempt is itself a normal, expected outcome the gate needs to react to.
   */
  pinVersion?(location: ManifestLocation, target: PinTarget, ctx: UpdateContext): Promise<boolean>;
}
