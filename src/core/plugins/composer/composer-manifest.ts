import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

interface ComposerJsonShape {
  readonly require?: Record<string, string>;
  readonly 'require-dev'?: Record<string, string>;
}

export function detectComposerManifests(repoFiles: readonly string[]): ManifestLocation[] {
  const repoFileSet = new Set(repoFiles);
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'composer.json')
    .filter((manifestPath) =>
      repoFileSet.has(path.join(path.dirname(manifestPath), 'composer.lock')),
    )
    .map((manifestPath) => ({
      ecosystem: 'composer' as const,
      language: 'PHP',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}

/** "php", "ext-*", and "lib-*" are platform pseudo-packages, not installable packages, so
 * they're never something `composer require` can bump. Real Packagist packages are always
 * "vendor/name". */
export function readDeclaredPackageNames(composerJson: ComposerJsonShape): string[] {
  const names = Object.keys({ ...composerJson.require, ...composerJson['require-dev'] });
  return names.filter((name) => name.includes('/'));
}
