import type { Logger } from '../logging/logger.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type {
  DependencyUpdatePlugin,
  EcosystemId,
  ManifestLocation,
  ManualNote,
  PackageChange,
  UpdateContext,
} from '../types/ecosystem-plugin.js';
import { isMajorBump } from '../update/diff-versions.js';
import { findVulnerableEntries } from './osv-client.js';
import { pickCompliantVersion } from './release-age-candidate.js';
import { downgradedNote, flaggedNote, heldBackNote, unverifiedNote } from './release-age-notes.js';
import { getVersionDates } from './release-date-registry.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReleaseAgeGateOptions {
  readonly minAgeDays: number;
  readonly manifestsUpdated: readonly ManifestLocation[];
  readonly pluginRegistry: PluginRegistry;
  readonly repoRoot: string;
  readonly logger: Logger;
}

export interface ReleaseAgeGateResult {
  readonly changes: PackageChange[];
  readonly ageGateNotes: ManualNote[];
}

interface GateEnv {
  readonly minAgeDays: number;
  readonly manifestsUpdated: readonly ManifestLocation[];
  readonly pluginRegistry: PluginRegistry;
  readonly ctx: UpdateContext;
  readonly logger: Logger;
}

interface ChangeOutcome {
  readonly change: PackageChange | null;
  readonly note: ManualNote | null;
}

/**
 * Runs once, after every plugin has already updated its manifests, over the flat list of
 * `PackageChange`s the run produced. There is no single point every ecosystem's plugin shares
 * before its native tool resolves "latest", so this is deliberately a post-hoc pass: for each
 * change younger than `minAgeDays`, and not itself fixing a known vulnerability (checked via
 * OSV.dev against the *current* version), it walks back to the newest version old enough and
 * re-pins to it using the plugin's own `pinVersion`, the same way the plugin's own update command
 * would have written the lockfile. Ecosystems without `pinVersion` are flagged instead of
 * adjusted. Any lookup that can't complete fails open: the change is left as-is and noted as
 * unverified, rather than making the whole run unreliable whenever a public registry hiccups.
 */
export async function applyReleaseAgeGate(
  changes: readonly PackageChange[],
  options: ReleaseAgeGateOptions,
): Promise<ReleaseAgeGateResult> {
  const { minAgeDays, manifestsUpdated, pluginRegistry, repoRoot, logger } = options;
  const env: GateEnv = {
    minAgeDays,
    manifestsUpdated,
    pluginRegistry,
    ctx: { repoRoot, logger },
    logger,
  };

  // Range-only changes (package.json's declared range moved but the resolved version didn't)
  // pull in no new code, so there is nothing for the age gate to evaluate.
  const evaluable = changes.filter((change) => !change.indirect);
  const passthrough = changes.filter((change) => change.indirect);
  const vulnerableKeys = await findVulnerableCurrentVersions(evaluable, logger);
  const dateCache = createVersionDateCache();

  const finalChanges: PackageChange[] = [...passthrough];
  const notes: ManualNote[] = [];
  for (const change of evaluable) {
    const outcome = await evaluateChange(change, env, vulnerableKeys, dateCache);
    if (outcome.change) {
      finalChanges.push(outcome.change);
    }
    if (outcome.note) {
      notes.push(outcome.note);
    }
  }

  return { changes: finalChanges, ageGateNotes: notes };
}

async function evaluateChange(
  change: PackageChange,
  env: GateEnv,
  vulnerableKeys: ReadonlySet<string>,
  dateCache: VersionDateCache,
): Promise<ChangeOutcome> {
  if (vulnerableKeys.has(versionKey(change.ecosystem, change.name, change.fromVersion))) {
    return { change, note: null };
  }

  const versionDates = await dateCache.get(change.ecosystem, change.name);
  const toDate = versionDates?.get(change.toVersion);
  if (!versionDates || !toDate) {
    return { change, note: unverifiedNote(change, env.minAgeDays) };
  }

  const thresholdDate = new Date(Date.now() - env.minAgeDays * MS_PER_DAY);
  if (toDate.getTime() <= thresholdDate.getTime()) {
    return { change, note: null };
  }

  const plugin = env.pluginRegistry.get(change.ecosystem);
  if (!plugin.pinVersion) {
    return { change, note: flaggedNote(change, toDate, env.minAgeDays) };
  }

  return applyCompliantVersion(plugin, { change, versionDates, toDate, thresholdDate }, env);
}

interface AgeCheck {
  readonly change: PackageChange;
  readonly versionDates: ReadonlyMap<string, Date>;
  readonly toDate: Date;
  readonly thresholdDate: Date;
}

async function applyCompliantVersion(
  plugin: DependencyUpdatePlugin,
  check: AgeCheck,
  env: GateEnv,
): Promise<ChangeOutcome> {
  const { change, versionDates, toDate, thresholdDate } = check;
  const location = findManifestLocation(env.manifestsUpdated, change);
  const compliant = pickCompliantVersion(change, versionDates, thresholdDate);

  if (!compliant) {
    const reverted = location
      ? await tryPin(plugin, location, { name: change.name, version: change.fromVersion }, env)
      : false;
    // A successful revert means the file is genuinely back to fromVersion, so there is nothing
    // left to report. A failed revert leaves the too-fresh toVersion sitting on disk exactly as
    // before, so the change must stay visible, or it would be silently committed into the pull
    // request while the note claims "no update was applied".
    return {
      change: reverted ? null : change,
      note: heldBackNote(change, env.minAgeDays, reverted),
    };
  }

  const pinned = location
    ? await tryPin(plugin, location, { name: change.name, version: compliant.version }, env)
    : false;
  if (!pinned) {
    return { change, note: flaggedNote(change, toDate, env.minAgeDays) };
  }

  return {
    change: {
      ...change,
      toVersion: compliant.version,
      breaking: isMajorBump(change.fromVersion, compliant.version),
    },
    note: downgradedNote(change, compliant.version, env.minAgeDays),
  };
}

interface VersionDateCache {
  get(ecosystem: EcosystemId, name: string): Promise<Map<string, Date> | null>;
}

/** Memoizes per (ecosystem, name), since the same package can appear as more than one change
 * across different directories in the same run. */
function createVersionDateCache(): VersionDateCache {
  const cache = new Map<string, Promise<Map<string, Date> | null>>();
  return {
    get(ecosystem, name) {
      const key = `${ecosystem}::${name}`;
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      const promise = getVersionDates(ecosystem, name);
      cache.set(key, promise);
      return promise;
    },
  };
}

async function findVulnerableCurrentVersions(
  changes: readonly PackageChange[],
  logger: Logger,
): Promise<ReadonlySet<string>> {
  const matches = await findVulnerableEntries(
    changes.map((change) => ({
      ecosystem: change.ecosystem,
      name: change.name,
      version: change.fromVersion,
    })),
  );
  if (matches === null) {
    logger.warn(
      'Could not check OSV.dev for known vulnerabilities this run; the release-age policy was ' +
        'applied to every package without a security bypass.',
    );
    return new Set();
  }
  return new Set(
    matches.map((match) =>
      versionKey(match.query.ecosystem, match.query.name, match.query.version),
    ),
  );
}

function versionKey(ecosystem: EcosystemId, name: string, version: string): string {
  return `${ecosystem}::${name}::${version}`;
}

/**
 * Returns undefined (declining to pin, falling back to flagging) rather than guessing when more
 * than one manifest matches: most ecosystems have exactly one manifest per (ecosystem, directory),
 * but NuGet allows several .csproj files in the same directory, and picking the first one would
 * risk rewriting the wrong project file.
 */
function findManifestLocation(
  manifestsUpdated: readonly ManifestLocation[],
  change: PackageChange,
): ManifestLocation | undefined {
  const matches = manifestsUpdated.filter(
    (manifest) => manifest.ecosystem === change.ecosystem && manifest.directory === change.path,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

async function tryPin(
  plugin: DependencyUpdatePlugin,
  location: ManifestLocation,
  target: { readonly name: string; readonly version: string },
  env: GateEnv,
): Promise<boolean> {
  if (!plugin.pinVersion) {
    return false;
  }
  try {
    return await plugin.pinVersion(location, target.name, target.version, env.ctx);
  } catch (error) {
    env.logger.warn(
      `Failed to pin ${target.name} to ${target.version} in ${location.directory}: ` +
        `${(error as Error).message}`,
    );
    return false;
  }
}
