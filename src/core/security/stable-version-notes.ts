import type { ManualNote, PackageChange } from '../types/ecosystem-plugin.js';

const POLICY =
  'only stable versions are allowed (set allowUnstableVersions: true in the config file to change this)';

function unstableClause(change: PackageChange, marker: string): string {
  return `${change.name}'s newest resolved version, ${change.toVersion}, is not a stable release (its version contains "${marker}") and ${POLICY}`;
}

export function cappedToStableNote(
  change: PackageChange,
  marker: string,
  appliedVersion: string,
): ManualNote {
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason: `${unstableClause(change, marker)}, so this update was capped to ${appliedVersion} instead, the newest stable version.`,
  };
}

export function heldBackUnstableNote(
  change: PackageChange,
  marker: string,
  reverted: boolean,
): ManualNote {
  const revertClause = reverted
    ? ''
    : ' (the attempt to revert it back to the current version may also have failed, check the diff)';
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason:
      `${unstableClause(change, marker)}. No stable version newer than ${change.fromVersion} ` +
      `was found, so no update was applied this run${revertClause}.`,
  };
}

export function flaggedUnstableNote(change: PackageChange, marker: string): ManualNote {
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason:
      `${unstableClause(change, marker)}, but it could not be pinned back to a stable version ` +
      'automatically, so it was left as-is; revert it or pin a stable version before merging.',
  };
}
