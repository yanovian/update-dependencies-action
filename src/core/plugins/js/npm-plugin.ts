import { MANIFEST_FILENAMES } from '../../discovery/manifest-patterns.js';
import type { DependencyUpdatePlugin } from '../../types/ecosystem-plugin.js';
import { detectNpmManifests, pinJsVersion, runJsUpdate } from './js-manifest.js';
import { resolvePackageLockVersions } from './npm-lockfile.js';

const NON_BREAKING_COMMAND = 'npm update';
// npm has no built-in flag to ignore semver ranges, so breaking mode uses npm-check-updates
// (the standard tool for this) to rewrite package.json itself, then installs.
const BREAKING_COMMAND = 'npx --yes npm-check-updates -u --target latest && npm install';

export function createNpmPlugin(): DependencyUpdatePlugin {
  return {
    id: 'npm',
    language: 'JavaScript/TypeScript',
    detectManifests: detectNpmManifests,
    update: (location, mode, ctx) =>
      runJsUpdate({
        ecosystem: 'npm',
        location,
        ctx,
        lockfileName: MANIFEST_FILENAMES.npm.lockfile,
        command: mode === 'breaking' ? BREAKING_COMMAND : NON_BREAKING_COMMAND,
        resolveVersions: resolvePackageLockVersions,
      }),
    pinVersion: (location, name, version, ctx) =>
      pinJsVersion((pkg) => `npm install ${pkg}`, location, { name, version }, ctx),
  };
}
