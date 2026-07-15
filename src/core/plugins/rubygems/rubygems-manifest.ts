import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

/** Bundler projects virtually always commit Gemfile.lock, so requiring it alongside Gemfile
 * (rather than tolerating its absence like npm does) keeps the plugin simple with no meaningful
 * loss of coverage. */
export function detectGemManifests(repoFiles: readonly string[]): ManifestLocation[] {
  const repoFileSet = new Set(repoFiles);
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'Gemfile')
    .filter((manifestPath) =>
      repoFileSet.has(path.join(path.dirname(manifestPath), 'Gemfile.lock')),
    )
    .map((manifestPath) => ({
      ecosystem: 'rubygems' as const,
      language: 'Ruby',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}
