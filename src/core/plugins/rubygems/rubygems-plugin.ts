import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { diffVersions } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { detectGemManifests } from './rubygems-manifest.js';
import { resolveGemfileLockVersions } from './rubygems-lockfile.js';

// bundler has no flag to ignore Gemfile's own version constraints, so breaking mode just runs
// an unrestricted update; how far that actually moves a gem still depends on what the Gemfile
// itself allows (e.g. a "~> 7.0" pin caps it at the 7.x series regardless of this flag).
const NON_BREAKING_COMMAND = 'bundle update --conservative --patch --minor';
const BREAKING_COMMAND = 'bundle update';

export function createRubyGemsPlugin(): DependencyUpdatePlugin {
  return {
    id: 'rubygems',
    language: 'Ruby',
    detectManifests: detectGemManifests,
    update: updateGems,
  };
}

async function updateGems(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const lockfileAbsPath = path.join(dir, 'Gemfile.lock');

  const before = resolveGemfileLockVersions(await readFile(lockfileAbsPath, 'utf8'));

  const command = mode === 'breaking' ? BREAKING_COMMAND : NON_BREAKING_COMMAND;
  await runProcess(command, { cwd: dir });

  const after = resolveGemfileLockVersions(await readFile(lockfileAbsPath, 'utf8'));
  return {
    changes: diffVersions(before, after, 'rubygems', location.directory),
    manualActionNeeded: [],
  };
}
