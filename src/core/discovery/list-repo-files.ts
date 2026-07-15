import { readdir } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  'coverage',
  '__pycache__',
  'bin',
  'obj',
  '.gradle',
]);

/** Recursively lists every file in a repo, as paths relative to repoRoot, skipping build output
 * and dependency directories that would otherwise slow discovery down for no benefit. */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
  const files: string[] = [];
  await walkDirectory(repoRoot, repoRoot, files);
  return files;
}

async function walkDirectory(repoRoot: string, currentDir: string, files: string[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) {
        await walkDirectory(repoRoot, path.join(currentDir, entry.name), files);
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(repoRoot, path.join(currentDir, entry.name)));
    }
  }
}
