import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

export function detectNuGetManifests(repoFiles: readonly string[]): ManifestLocation[] {
  return repoFiles
    .filter((filePath) => filePath.endsWith('.csproj'))
    .map((manifestPath) => ({
      ecosystem: 'nuget' as const,
      language: 'C#/.NET',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}
