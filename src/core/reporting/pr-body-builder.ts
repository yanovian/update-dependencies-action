import type { CommandResult } from '../commands/command-runner.js';
import type { StalePullRequest } from '../github/pr-manager.js';
import type { ManualNote, PackageChange, UpdateMode } from '../types/ecosystem-plugin.js';

const ACTION_URL = 'https://github.com/yanovian/update-dependencies-action';

export interface PrBodyOptions {
  readonly mode: UpdateMode;
  readonly changes: readonly PackageChange[];
  readonly manualActionNeeded: readonly ManualNote[];
  readonly ageGateNotes: readonly ManualNote[];
  readonly minReleaseAgeDays: number;
  readonly commandResults: readonly CommandResult[];
  readonly runDate: string;
  readonly stalePullRequests: readonly StalePullRequest[];
}

export function buildPullRequestTitle(
  changes: readonly PackageChange[],
  mode: UpdateMode,
  runDate: string,
): string {
  const paths = new Set(changes.map((change) => change.path));
  const kind = mode === 'breaking' ? 'breaking' : 'non-breaking';
  return `chore(deps): ${kind} update of ${changes.length} package(s) across ${paths.size} path(s) (${runDate})`;
}

export function buildPullRequestBody(options: PrBodyOptions): string {
  const sections = [
    buildRunDateNote(options.runDate, options.minReleaseAgeDays),
    buildChangesTable(options.changes),
    buildAgeGateSection(options.ageGateNotes),
    buildManualNotesSection(options.manualActionNeeded),
    buildCommandsSection(options.commandResults),
    buildStalePullRequestsSection(options.stalePullRequests),
    buildSecuritySection(),
    buildFooter(),
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
}

function buildRunDateNote(runDate: string, minReleaseAgeDays: number): string {
  const policyNote =
    minReleaseAgeDays > 0
      ? ` Versions younger than ${minReleaseAgeDays} day(s) are held back unless they fix a known vulnerability.`
      : '';
  return (
    `**Run date:** ${runDate} (UTC). The versions below are what was latest as of this date.` +
    policyNote
  );
}

function buildAgeGateSection(notes: readonly ManualNote[]): string {
  if (notes.length === 0) {
    return '';
  }
  const items = notes.map(
    (note) => `- **${note.path}**${note.name ? ` (${note.name})` : ''}: ${note.reason}`,
  );
  return ['## Release-age policy', '', ...items].join('\n');
}

function buildChangesTable(changes: readonly PackageChange[]): string {
  const sorted = [...changes].sort(
    (a, b) =>
      a.ecosystem.localeCompare(b.ecosystem) ||
      a.path.localeCompare(b.path) ||
      a.name.localeCompare(b.name),
  );
  const rows = sorted.map((change) => {
    const type = change.breaking ? 'Breaking' : 'Non-breaking';
    return `| ${change.ecosystem} | ${change.path} | ${change.name} | ${change.fromVersion} | ${change.toVersion} | ${change.indirect ? `${type} (indirect)` : type} |`;
  });

  return [
    '## Dependency changes',
    '',
    '| Ecosystem | Path | Package | From | To | Type |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildManualNotesSection(notes: readonly ManualNote[]): string {
  if (notes.length === 0) {
    return '';
  }
  const items = notes.map(
    (note) => `- **${note.path}**${note.name ? ` (${note.name})` : ''}: ${note.reason}`,
  );
  return ['## Needs a manual look', '', ...items].join('\n');
}

function buildCommandsSection(commandResults: readonly CommandResult[]): string {
  if (commandResults.length === 0) {
    return '';
  }
  const items = commandResults.map((result, index) => `${index + 1}. \`${result.command}\``);
  return [
    '## Commands run',
    '',
    'Every command below passed before this pull request was opened:',
    '',
    ...items,
  ].join('\n');
}

function buildStalePullRequestsSection(stalePullRequests: readonly StalePullRequest[]): string {
  if (stalePullRequests.length === 0) {
    return '';
  }
  const items = stalePullRequests.map(
    (pullRequest) => `- #${pullRequest.number} (branch \`${pullRequest.branchName}\`)`,
  );
  return [
    '## Other open pull requests from this Action',
    '',
    `${stalePullRequests.length} other open pull request(s) look like they were opened by this ` +
      'Action on an earlier run, based on their branch name:',
    '',
    ...items,
    '',
    'We recommend closing those and working from this one instead, it has the latest versions. ' +
      'Double-check each one first, in case the branch name is a coincidence or someone has ' +
      'since added their own changes to it.',
  ].join('\n');
}

function buildSecuritySection(): string {
  return [
    '## Why keep dependencies updated',
    '',
    'An outdated dependency is a common way vulnerabilities reach production: an old version can ' +
      'carry a known, publicly documented flaw that a newer release already fixed. Keeping ' +
      'dependencies current is one of the simplest ways to reduce that exposure.',
    '',
    'That said, passing automated checks is not the same as being safe to merge. It is the ' +
      'responsibility of the dev, QA, and test teams to confirm this update does not change your ' +
      'application logic in ways your tests do not catch, whether through solid automated ' +
      'coverage or a manual pass. We recommend manually testing regardless, across the different ' +
      'areas of your app that matter, even when everything above already passed.',
  ].join('\n');
}

function buildFooter(): string {
  return `This pull request was opened automatically by [Update Dependencies](${ACTION_URL}).`;
}
