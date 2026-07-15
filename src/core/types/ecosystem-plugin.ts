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
}

export interface UpdateContext {
  readonly repoRoot: string;
  readonly logger: Logger;
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
}
