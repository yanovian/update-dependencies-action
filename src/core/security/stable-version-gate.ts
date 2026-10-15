import type { Logger } from '../logging/logger.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type {
  ManifestLocation,
  ManualNote,
  PackageChange,
  UpdateContext,
} from '../types/ecosystem-plugin.js';
import { isMajorBump } from '../update/diff-versions.js';
import {
  createVersionDateCache,
  findManifestLocation,
  pinTarget,
  tryPin,
  type VersionDateCache,
} from './gate-pinning.js';
import { pickCompliantVersion } from './release-age-candidate.js';
import { evaluateGroupedByManifest } from './release-age-scheduler.js';
import {
  cappedToStableNote,
  flaggedUnstableNote,
  heldBackUnstableNote,
} from './stable-version-notes.js';
import { findUnstableMarker, unstableVersionsOf } from './version-stability.js';

export interface StableVersionGateOptions {
  readonly manifestsUpdated: readonly ManifestLocation[];
  readonly pluginRegistry: PluginRegistry;
  readonly repoRoot: string;
  readonly logger: Logger;
}

export interface StableVersionGateResult {
  readonly changes: PackageChange[];
  readonly stabilityNotes: ManualNote[];
}

interface GateEnv {
  readonly manifestsUpdated: readonly ManifestLocation[];
  readonly pluginRegistry: PluginRegistry;
  readonly ctx: UpdateContext;
  readonly logger: Logger;
  readonly dateCache: VersionDateCache;
}

interface ChangeOutcome {
  readonly change: PackageChange | null;
  readonly note: ManualNote | null;
}

/**
 * Runs once, after every plugin has already updated its manifests and before the release-age
 * gate, for the same reason that gate is post-hoc: there is no single point every ecosystem's
 * plugin shares before its native tool resolves "latest". Each change that resolved to a version
 * that isn't a stable release (see version-stability.ts) is walked back to the newest stable
 * version still newer than what's installed, via the plugin's own `pinVersion`, or reverted when
 * there is none. Unlike the release-age gate this never fails open: when no stable alternative
 * can be confirmed, the change is reverted rather than let through.
 */
export async function applyStableVersionGate(
  changes: readonly PackageChange[],
  options: StableVersionGateOptions,
): Promise<StableVersionGateResult> {
  const { manifestsUpdated, pluginRegistry, repoRoot, logger } = options;
  const env: GateEnv = {
    manifestsUpdated,
    pluginRegistry,
    ctx: { repoRoot, logger },
    logger,
    dateCache: createVersionDateCache(),
  };

  // Range-only changes pull in no new resolved version, so there is nothing to evaluate.
  const evaluable = changes.filter(
    (change) => !change.indirect && findUnstableMarker(change.ecosystem, change.toVersion) !== null,
  );
  const passthrough = changes.filter((change) => !evaluable.includes(change));

  const outcomes = await evaluateGroupedByManifest(evaluable, (change) =>
    evaluateChange(change, env),
  );

  const finalChanges: PackageChange[] = [...passthrough];
  const notes: ManualNote[] = [];
  for (const outcome of outcomes) {
    if (outcome.change) {
      finalChanges.push(outcome.change);
    }
    if (outcome.note) {
      notes.push(outcome.note);
    }
  }
  return { changes: finalChanges, stabilityNotes: notes };
}

async function evaluateChange(change: PackageChange, env: GateEnv): Promise<ChangeOutcome> {
  const marker = findUnstableMarker(change.ecosystem, change.toVersion) ?? '';
  const plugin = env.pluginRegistry.get(change.ecosystem);
  const location = findManifestLocation(env.manifestsUpdated, change);
  if (!plugin.pinVersion || !location) {
    return { change, note: flaggedUnstableNote(change, marker) };
  }

  const versionDates = await env.dateCache.get(change.ecosystem, change.name);
  // No age requirement here (the release-age gate applies its own afterwards), only "stable and
  // newer than what's installed, without crossing a major boundary a non-breaking run wouldn't".
  const stable = versionDates
    ? pickCompliantVersion(
        change,
        versionDates,
        new Date(),
        unstableVersionsOf(change.ecosystem, versionDates.keys()),
      )
    : null;

  if (!stable) {
    const reverted = await tryPin(plugin, location, pinTarget(change, change.fromVersion), env.ctx);
    // Same reasoning as the release-age gate: a failed revert leaves the unstable version on
    // disk, so the change must stay visible rather than be silently committed.
    return {
      change: reverted ? null : change,
      note: heldBackUnstableNote(change, marker, reverted),
    };
  }

  const pinned = await tryPin(plugin, location, pinTarget(change, stable.version), env.ctx);
  if (!pinned) {
    return { change, note: flaggedUnstableNote(change, marker) };
  }
  return {
    change: {
      ...change,
      toVersion: stable.version,
      breaking: isMajorBump(change.fromVersion, stable.version),
    },
    note: cappedToStableNote(change, marker, stable.version),
  };
}
