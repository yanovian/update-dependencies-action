import path from 'node:path';
import { MANIFEST_FILENAMES } from '../../discovery/manifest-patterns.js';
import type { DependencyUpdatePlugin, ManifestLocation } from '../../types/ecosystem-plugin.js';
import { detectPnpmManifests, pinJsVersion, runJsUpdate } from './js-manifest.js';
import { resolvePnpmLockVersions } from './pnpm-lockfile.js';

const NON_BREAKING_COMMAND = 'pnpm update';
// pnpm has --latest built in to ignore package.json's semver range.
const BREAKING_COMMAND = 'pnpm update --latest';

export function createPnpmPlugin(): DependencyUpdatePlugin {
  return {
    id: 'pnpm',
    language: 'JavaScript/TypeScript',
    detectManifests: detectPnpmManifests,
    update: (location, mode, ctx) =>
      runJsUpdate({
        ecosystem: 'pnpm',
        location,
        ctx,
        lockfileName: MANIFEST_FILENAMES.pnpm.lockfile,
        command: mode === 'breaking' ? BREAKING_COMMAND : NON_BREAKING_COMMAND,
        resolveVersions: (contents, declared) =>
          resolvePnpmLockVersions(contents, declared, importerKeyOf(location)),
      }),
    pinVersion: (location, target, ctx) =>
      pinJsVersion((pkg) => `pnpm add ${pkg}`, location, target, ctx),
  };
}

/** A workspace member's key in its shared lockfile's `importers` map is its own directory,
 * relative to the workspace root; a standalone project or the workspace root itself is always
 * keyed "." (see pnpm-workspace.ts, which computes `lockfileDirectory` the same way). */
function importerKeyOf(location: ManifestLocation): string {
  if (!location.lockfileDirectory) {
    return '.';
  }
  return path.relative(location.lockfileDirectory, location.directory) || '.';
}
