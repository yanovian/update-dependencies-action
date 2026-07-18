import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult } from '../commands/command-runner.js';
import type { ManualNote, PackageChange, UpdateMode } from '../types/ecosystem-plugin.js';

const SUMMARY_FILENAME = 'update-dependencies-summary.json';

export interface UpdateSummary {
  readonly mode: UpdateMode;
  readonly changes: readonly PackageChange[];
  readonly manualActionNeeded: readonly ManualNote[];
  readonly ageGateNotes: readonly ManualNote[];
  readonly commands: readonly CommandResult[];
}

/** outputDir must be outside the repo checkout: this file is never meant to be committed, and
 * this Action's own git commit only adds the specific directories it touched, never the whole
 * tree, so writing it inside the checkout would either get silently dropped or, worse, get
 * swept into the pull request by a future change that widens what gets added. */
export async function writeSummaryToDisk(
  summary: UpdateSummary,
  outputDir: string,
): Promise<string> {
  const summaryPath = path.join(outputDir, SUMMARY_FILENAME);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  return summaryPath;
}
