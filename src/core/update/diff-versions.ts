import type { EcosystemId, PackageChange } from '../types/ecosystem-plugin.js';

/** Extracts the leading integer of a version string, good enough across every ecosystem's
 * versioning scheme (semver, PEP 440, Maven's dotted scheme, etc.) since they all start with a
 * numeric major component. */
export function majorOf(version: string): number | null {
  const match = /(\d+)/.exec(version);
  return match ? Number(match[1]) : null;
}

export function isMajorBump(fromVersion: string, toVersion: string): boolean {
  const fromMajor = majorOf(fromVersion);
  const toMajor = majorOf(toVersion);
  return fromMajor !== null && toMajor !== null && toMajor > fromMajor;
}

/** Compares two name-to-resolved-version snapshots and reports every package whose version
 * changed, tagging each as breaking based on the actual version jump, not the mode that was
 * requested (a "breaking" run can still produce plenty of non-breaking bumps). */
export function diffVersions(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  ecosystem: EcosystemId,
  path: string,
): PackageChange[] {
  const changes: PackageChange[] = [];
  for (const [name, toVersion] of after) {
    const fromVersion = before.get(name);
    if (fromVersion && fromVersion !== toVersion) {
      changes.push({
        ecosystem,
        path,
        name,
        fromVersion,
        toVersion,
        breaking: isMajorBump(fromVersion, toVersion),
      });
    }
  }
  return changes;
}
