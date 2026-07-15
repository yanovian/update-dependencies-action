import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

export function detectRequirementsManifests(repoFiles: readonly string[]): ManifestLocation[] {
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'requirements.txt')
    .map((manifestPath) => ({
      ecosystem: 'pip' as const,
      language: 'Python',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}

/** Only plain `name==version` pins are managed; anything else (VCS links, `-r other.txt`,
 * unpinned ranges, comments) is left untouched since there is nothing safe to rewrite. */
export function parsePinnedLine(line: string): { name: string; version: string } | null {
  const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*==\s*([^\s#;]+)/.exec(line);
  return match?.[1] && match[2] ? { name: match[1], version: match[2] } : null;
}

/** PEP 503 normalization: package names are compared case-insensitively with runs of
 * -, _, and . treated as equivalent. */
export function normalizePipName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}
