import type { PluginRegistry } from '../core/plugins/registry.js';
import { applyReleaseAgeGate } from '../core/security/release-age-gate.js';
import { applyStableVersionGate } from '../core/security/stable-version-gate.js';
import type { ManualNote, PackageChange } from '../core/types/ecosystem-plugin.js';
import type { UpdateRepoResult } from '../core/update/update-repo.js';
import type { RunContext } from './run.js';

/** Why a gate walked a change back, held it back, or flagged it; each kind gets its own section
 * in the pull request body. */
export interface GateNotes {
  readonly stabilityNotes: readonly ManualNote[];
  readonly ageGateNotes: readonly ManualNote[];
}

/** The stable-version gate runs first, so the release-age gate only ever sees (and walks back
 * from) a version that is already stable. */
export async function gateChanges(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  registry: PluginRegistry,
): Promise<{ changes: PackageChange[]; notes: GateNotes }> {
  const stable = await gateUnstableVersions(ctx, updateResult, registry);
  const aged = await gateReleaseAge(ctx, { ...updateResult, changes: stable.changes }, registry);
  return {
    changes: aged.changes,
    notes: { stabilityNotes: stable.stabilityNotes, ageGateNotes: aged.ageGateNotes },
  };
}

async function gateUnstableVersions(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  registry: PluginRegistry,
): Promise<{ changes: PackageChange[]; stabilityNotes: ManualNote[] }> {
  const { config, repoRoot, logger } = ctx;
  if (config.allowUnstableVersions) {
    return { changes: updateResult.changes, stabilityNotes: [] };
  }
  return applyStableVersionGate(updateResult.changes, {
    manifestsUpdated: updateResult.manifestsUpdated,
    pluginRegistry: registry,
    repoRoot,
    logger,
  });
}

/** Skipped entirely (no network calls) when the policy is disabled, rather than calling the gate
 * with a threshold of zero days, which would still spend a registry round trip per package only
 * to confirm every version already clears it. */
async function gateReleaseAge(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  registry: PluginRegistry,
): Promise<{ changes: PackageChange[]; ageGateNotes: ManualNote[] }> {
  const { inputs, config, repoRoot, logger } = ctx;
  if (inputs.minReleaseAgeDays <= 0) {
    return { changes: updateResult.changes, ageGateNotes: [] };
  }
  logger.info(`Applying the ${inputs.minReleaseAgeDays}-day minimum release age policy`);
  return applyReleaseAgeGate(updateResult.changes, {
    minAgeDays: inputs.minReleaseAgeDays,
    stableOnly: !config.allowUnstableVersions,
    manifestsUpdated: updateResult.manifestsUpdated,
    pluginRegistry: registry,
    repoRoot,
    logger,
  });
}
