import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult } from '../commands/command-runner.js';
import type { ManualNote, PackageChange, UpdateMode } from '../types/ecosystem-plugin.js';

const SUMMARY_FILENAME = 'update-dependencies-summary.json';

export interface UpdateSummary {
  readonly mode: UpdateMode;
  readonly changes: readonly PackageChange[];
  readonly manualActionNeeded: readonly ManualNote[];
  readonly commands: readonly CommandResult[];
}

export async function writeSummaryToDisk(
  summary: UpdateSummary,
  repoRoot: string,
): Promise<string> {
  const summaryPath = path.join(repoRoot, SUMMARY_FILENAME);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  return summaryPath;
}
