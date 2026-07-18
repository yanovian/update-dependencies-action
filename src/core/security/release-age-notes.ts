import type { ManualNote, PackageChange } from '../types/ecosystem-plugin.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / MS_PER_DAY));
}

export function unverifiedNote(change: PackageChange, minAgeDays: number): ManualNote {
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason:
      `Could not verify ${change.name}@${change.toVersion}'s release date or vulnerability ` +
      `status against the ${minAgeDays}-day minimum release age policy in time, so it was let ` +
      'through unverified. Double-check its release date before merging.',
  };
}

export function flaggedNote(change: PackageChange, toDate: Date, minAgeDays: number): ManualNote {
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason:
      `${change.name}@${change.toVersion} was released ${daysAgo(toDate)} day(s) ago, below the ` +
      `${minAgeDays}-day minimum release age policy. This ecosystem doesn't support pinning to ` +
      'an exact older version automatically, so it was left as-is; give it extra scrutiny before merging.',
  };
}

export function downgradedNote(
  change: PackageChange,
  appliedVersion: string,
  minAgeDays: number,
): ManualNote {
  return {
    ecosystem: change.ecosystem,
    path: change.path,
    name: change.name,
    reason:
      `${change.name}'s newest resolved version, ${change.toVersion}, is younger than the ` +
      `${minAgeDays}-day minimum release age policy, so this update was capped to ` +
      `${appliedVersion} instead, the newest version old enough to clear it.`,
  };
}

export function heldBackNote(
  change: PackageChange,
  minAgeDays: number,
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
      `Every version of ${change.name} newer than ${change.fromVersion} is younger than the ` +
      `${minAgeDays}-day minimum release age policy, so no update was applied this run${revertClause}.`,
  };
}
