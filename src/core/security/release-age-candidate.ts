import type { PackageChange } from '../types/ecosystem-plugin.js';
import { majorOf } from '../update/diff-versions.js';

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
 */
export function pickCompliantVersion(
  change: PackageChange,
  versionDates: ReadonlyMap<string, Date>,
  thresholdDate: Date,
): { version: string; date: Date } | null {
  const eligibility: EligibilityContext = {
    fromDate: versionDates.get(change.fromVersion) ?? null,
    fromMajor: majorOf(change.fromVersion),
    thresholdDate,
  };

  let best: { version: string; date: Date } | null = null;
  for (const [version, date] of versionDates) {
    if (!isEligibleCandidate(change, version, date, eligibility)) {
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
