import { MANIFEST_FILENAMES } from '../../discovery/manifest-patterns.js';
import type { DependencyUpdatePlugin } from '../../types/ecosystem-plugin.js';
import { detectJsManifests, runJsUpdate } from './js-manifest.js';
import { resolvePnpmLockVersions } from './pnpm-lockfile.js';

const NON_BREAKING_COMMAND = 'pnpm update';
// pnpm has --latest built in to ignore package.json's semver range.
const BREAKING_COMMAND = 'pnpm update --latest';

export function createPnpmPlugin(): DependencyUpdatePlugin {
  return {
    id: 'pnpm',
    language: 'JavaScript/TypeScript',
    detectManifests: (repoFiles) =>
      detectJsManifests(repoFiles, 'pnpm', MANIFEST_FILENAMES.pnpm.lockfile),
    update: (location, mode, ctx) =>
      runJsUpdate({
        ecosystem: 'pnpm',
        location,
        ctx,
        lockfileName: MANIFEST_FILENAMES.pnpm.lockfile,
        command: mode === 'breaking' ? BREAKING_COMMAND : NON_BREAKING_COMMAND,
        resolveVersions: resolvePnpmLockVersions,
      }),
  };
}
