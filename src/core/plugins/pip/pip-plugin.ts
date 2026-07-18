import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { isMajorBump } from '../../update/diff-versions.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PackageChange,
  PluginUpdateResult,
  UpdateContext,
  UpdateMode,
} from '../../types/ecosystem-plugin.js';
import { detectRequirementsManifests, normalizePipName, parsePinnedLine } from './pip-manifest.js';
import { findOutdatedPackages } from './pip-outdated.js';

export function createPipPlugin(): DependencyUpdatePlugin {
  return {
    id: 'pip',
    language: 'Python',
    detectManifests: detectRequirementsManifests,
    update: updateRequirements,
    pinVersion: pinRequirementVersion,
  };
}

/** Rewrites just the one matching `name==version` pin, the same line-level rewrite
 * `updateRequirements` already does, without re-running `pip install` first, since
 * requirements.txt is the source of truth this plugin diffs against either way. */
async function pinRequirementVersion(
  location: ManifestLocation,
  name: string,
  version: string,
  ctx: UpdateContext,
): Promise<boolean> {
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);
  const original = await readFile(manifestAbsPath, 'utf8');
  const normalizedTarget = normalizePipName(name);

  let matched = false;
  const rewritten = original
    .split('\n')
    .map((line) => {
      const pin = parsePinnedLine(line);
      if (!pin || normalizePipName(pin.name) !== normalizedTarget) {
        return line;
      }
      matched = true;
      return line.replace(/==\s*[^\s#;]+/, `==${version}`);
    })
    .join('\n');

  if (!matched) {
    return false;
  }
  await writeFile(manifestAbsPath, rewritten, 'utf8');
  return true;
}

async function updateRequirements(
  location: ManifestLocation,
  mode: UpdateMode,
  ctx: UpdateContext,
): Promise<PluginUpdateResult> {
  const dir = path.join(ctx.repoRoot, location.directory);
  const manifestAbsPath = path.join(ctx.repoRoot, location.manifestPath);

  await runProcess('pip install -r requirements.txt', { cwd: dir });
  const outdated = await findOutdatedPackages(dir);

  const original = await readFile(manifestAbsPath, 'utf8');
  const changes: PackageChange[] = [];
  const rewriteOptions: RewriteLineOptions = {
    directory: location.directory,
    mode,
    outdated,
    changes,
  };
  const rewritten = original
    .split('\n')
    .map((line) => rewriteLine(line, rewriteOptions))
    .join('\n');

  if (changes.length > 0) {
    await writeFile(manifestAbsPath, rewritten, 'utf8');
  }

  return { changes, manualActionNeeded: [] };
}

interface RewriteLineOptions {
  readonly directory: string;
  readonly mode: UpdateMode;
  readonly outdated: ReadonlyMap<string, string>;
  readonly changes: PackageChange[];
}

function rewriteLine(line: string, options: RewriteLineOptions): string {
  const { directory, mode, outdated, changes } = options;
  const pin = parsePinnedLine(line);
  if (!pin) {
    return line;
  }

  const candidate = outdated.get(normalizePipName(pin.name));
  if (!candidate || candidate === pin.version) {
    return line;
  }

  const breaking = isMajorBump(pin.version, candidate);
  if (mode === 'non-breaking' && breaking) {
    return line;
  }

  changes.push({
    ecosystem: 'pip',
    path: directory,
    name: pin.name,
    fromVersion: pin.version,
    toVersion: candidate,
    breaking,
  });
  return line.replace(/==\s*[^\s#;]+/, `==${candidate}`);
}
