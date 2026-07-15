import type { CommandResult } from '../commands/command-runner.js';
import type { ManualNote, PackageChange, UpdateMode } from '../types/ecosystem-plugin.js';

const ACTION_URL = 'https://github.com/yanovian/update-dependencies-action';

export interface PrBodyOptions {
  readonly mode: UpdateMode;
  readonly changes: readonly PackageChange[];
  readonly manualActionNeeded: readonly ManualNote[];
  readonly commandResults: readonly CommandResult[];
}

export function buildPullRequestTitle(changes: readonly PackageChange[], mode: UpdateMode): string {
  const paths = new Set(changes.map((change) => change.path));
  const kind = mode === 'breaking' ? 'breaking' : 'non-breaking';
  return `chore(deps): ${kind} update of ${changes.length} package(s) across ${paths.size} path(s)`;
}

export function buildPullRequestBody(options: PrBodyOptions): string {
  const sections = [
    buildChangesTable(options.changes),
    buildManualNotesSection(options.manualActionNeeded),
    buildCommandsSection(options.commandResults),
    buildFooter(),
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
}

function buildChangesTable(changes: readonly PackageChange[]): string {
  const sorted = [...changes].sort(
    (a, b) =>
      a.ecosystem.localeCompare(b.ecosystem) ||
      a.path.localeCompare(b.path) ||
      a.name.localeCompare(b.name),
  );
  const rows = sorted.map(
    (change) =>
      `| ${change.ecosystem} | ${change.path} | ${change.name} | ${change.fromVersion} | ${change.toVersion} | ${change.breaking ? 'Breaking' : 'Non-breaking'} |`,
  );

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

function buildFooter(): string {
  return [
    `This pull request was opened automatically by [Update Dependencies](${ACTION_URL}).`,
    '',
    'Please review and test this change yourself before merging. Passing commands is not a ' +
      'substitute for a human check, especially for a breaking update.',
  ].join('\n');
}
