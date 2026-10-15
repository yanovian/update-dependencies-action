import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const ACTION_FILE_NAMES = new Set(['action.yml', 'action.yaml']);

/** A workflow file (`.github/workflows/*.yml`, the only place GitHub reads them from), or a
 * composite action's `action.yml` anywhere in the repo. Both declare steps with `uses:`. */
export function isActionManifestFile(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  return WORKFLOW_FILE.test(normalized) || ACTION_FILE_NAMES.has(path.basename(normalized));
}

/**
 * One location per directory, not per file: every other ecosystem has one manifest per
 * directory, and the post-hoc gates find a change's manifest by its directory, so a workflows
 * directory with ten files is still one location. `manifestPath` is the first file, for display.
 */
export function detectGitHubActionsManifests(repoFiles: readonly string[]): ManifestLocation[] {
  const byDirectory = new Map<string, string>();
  for (const filePath of [...repoFiles].sort()) {
    const directory = path.dirname(filePath);
    if (isActionManifestFile(filePath) && !byDirectory.has(directory)) {
      byDirectory.set(directory, filePath);
    }
  }
  return [...byDirectory].map(([directory, manifestPath]) => ({
    ecosystem: 'github-actions' as const,
    language: 'GitHub Actions',
    manifestPath,
    directory,
  }));
}

/** Every workflow or action file directly in `location`'s directory, relative to the repo root. */
export async function listActionFiles(
  repoRoot: string,
  location: ManifestLocation,
): Promise<string[]> {
  const entries = await readdir(path.join(repoRoot, location.directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(location.directory, entry.name))
    .filter((filePath) => isActionManifestFile(filePath))
    .sort();
}
