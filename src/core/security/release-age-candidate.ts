import type { EcosystemId, PackageChange } from '../types/ecosystem-plugin.js';
import { majorOf } from '../update/diff-versions.js';
import { findVulnerableEntries } from './osv-client.js';

// A candidate that turns out to itself carry a known vulnerability is skipped and the next-best
// one tried instead; bounded so a package with many disclosed-vulnerable releases in a row can't
// turn into unbounded OSV traffic for one package.
const MAX_CANDIDATE_ATTEMPTS = 5;

/**
 * Same ranking as `pickCompliantVersion`, but also confirms each candidate isn't itself a known
 * vulnerability before accepting it (checked one at a time, since which candidate is "next best"
 * depends on the previous one being rejected), trying the next-best instead when it is.
 */
export async function pickSafeCompliantVersion(
  change: PackageChange,
  versionDates: ReadonlyMap<string, Date>,
  thresholdDate: Date,
): Promise<{ version: string; date: Date } | null> {
  const excluded = new Set<string>();
  for (let attempt = 0; attempt < MAX_CANDIDATE_ATTEMPTS; attempt++) {
    const candidate = pickCompliantVersion(change, versionDates, thresholdDate, excluded);
    if (!candidate) {
      return null;
    }
    if (!(await isVersionVulnerable(change.ecosystem, change.name, candidate.version))) {
      return candidate;
    }
    excluded.add(candidate.version);
  }
  return null;
}

async function isVersionVulnerable(
  ecosystem: EcosystemId,
  name: string,
  version: string,
): Promise<boolean> {
  const matches = await findVulnerableEntries([{ ecosystem, name, version }]);
  // Fails open, consistent with every other lookup this gate makes: a check that couldn't
  // complete doesn't block the candidate.
  return matches !== null && matches.length > 0;
}

interface EligibilityContext {
  readonly fromDate: Date | null;
  readonly fromMajor: number | null;
  readonly thresholdDate: Date;
}

/**
 * Among every known version of this package, finds the newest one that is old enough, still
 * strictly newer than what's currently installed, and preserves the original change's
 * breaking-ness (same major as `fromVersion` if it wasn't a major bump, any major if it was).
 * Selection is by publish date, not by parsing/comparing version strings, since date is already
 * available for every candidate and version schemes differ too much across ecosystems (semver,
 * PEP 440, Maven's dotted scheme, Go's "v"-prefixed tags) to compare reliably in general.
 *
 * `excludedVersions` lets the caller rule out candidates it already found unsuitable for a
 * reason this function doesn't know about (the release-age gate uses this to skip a candidate
 * that turned out to have its own known vulnerability and try the next-best one instead).
 */
export function pickCompliantVersion(
  change: PackageChange,
  versionDates: ReadonlyMap<string, Date>,
  thresholdDate: Date,
  excludedVersions: ReadonlySet<string> = new Set(),
): { version: string; date: Date } | null {
  const eligibility: EligibilityContext = {
    fromDate: versionDates.get(change.fromVersion) ?? null,
    fromMajor: majorOf(change.fromVersion),
    thresholdDate,
  };

  let best: { version: string; date: Date } | null = null;
  for (const [version, date] of versionDates) {
    if (excludedVersions.has(version) || !isEligibleCandidate(change, version, date, eligibility)) {
      continue;
    }
    if (!best || date.getTime() > best.date.getTime()) {
      best = { version, date };
    }
  }
  return best;
}

function isEligibleCandidate(
  change: PackageChange,
  version: string,
  date: Date,
  context: EligibilityContext,
): boolean {
  if (version === change.fromVersion || date.getTime() > context.thresholdDate.getTime()) {
    return false;
  }
  // Without fromVersion's own publish date, "published later" can't be confirmed for any
  // candidate, so none can be trusted to be newer than what's currently installed; better to
  // report no compliant version (the caller then reverts or flags) than silently pick a version
  // that turns out to be an actual downgrade.
  if (!context.fromDate || date.getTime() <= context.fromDate.getTime()) {
    return false;
  }
  if (change.breaking) {
    return true;
  }
  const versionMajor = majorOf(version);
  return context.fromMajor !== null && versionMajor === context.fromMajor;
}
