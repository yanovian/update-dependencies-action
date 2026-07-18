import { MANIFEST_FILENAMES } from '../../discovery/manifest-patterns.js';
import type { DependencyUpdatePlugin } from '../../types/ecosystem-plugin.js';
import { detectJsManifests, pinJsVersion, runJsUpdate } from './js-manifest.js';
import { resolveYarnVersions } from './yarn-lockfile.js';

const NON_BREAKING_COMMAND = 'yarn upgrade';
// Yarn (classic and Berry both) has --latest built in to ignore package.json's semver range.
const BREAKING_COMMAND = 'yarn upgrade --latest';

export function createYarnPlugin(): DependencyUpdatePlugin {
  return {
    id: 'yarn',
    language: 'JavaScript/TypeScript',
    detectManifests: (repoFiles) =>
      detectJsManifests(repoFiles, 'yarn', MANIFEST_FILENAMES.yarn.lockfile),
    update: (location, mode, ctx) =>
      runJsUpdate({
        ecosystem: 'yarn',
        location,
        ctx,
        lockfileName: MANIFEST_FILENAMES.yarn.lockfile,
        command: mode === 'breaking' ? BREAKING_COMMAND : NON_BREAKING_COMMAND,
        resolveVersions: resolveYarnVersions,
      }),
    pinVersion: (location, target, ctx) =>
      pinJsVersion((pkg) => `yarn add ${pkg}`, location, target, ctx),
  };
}
