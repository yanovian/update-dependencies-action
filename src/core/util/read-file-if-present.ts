import { readFile } from 'node:fs/promises';

/** Several plugins snapshot a lockfile that might not exist yet (a fresh repo, or an ecosystem
 * that only gets a lockfile once its first update runs); a missing file is not an error there. */
export async function readFileIfPresent(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, 'utf8');
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
