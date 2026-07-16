import { runProcess } from '../commands/run-process.js';
import type { ResolvedConfig } from '../config/config-schema.js';
import { isPathIgnored } from '../config/path-filter.js';
import { discoverManifests } from '../discovery/scan-repo.js';
import type { Logger } from '../logging/logger.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type {
  ManifestLocation,
  ManualNote,
  PackageChange,
  UpdateMode,
} from '../types/ecosystem-plugin.js';

export interface UpdateRepoResult {
  readonly manifestsUpdated: ManifestLocation[];
  readonly changes: PackageChange[];
  readonly manualActionNeeded: ManualNote[];
}

export interface UpdateRepoOptions {
  readonly repoRoot: string;
  readonly registry: PluginRegistry;
  readonly mode: UpdateMode;
  readonly config: ResolvedConfig;
  readonly logger: Logger;
}

/**
 * The ecosystem-agnostic core of the Action: discover manifests, then hand each one to its
 * plugin and collect what happened. Adding an ecosystem never touches this function.
 */
export async function updateRepo(
  repoFiles: readonly string[],
  options: UpdateRepoOptions,
): Promise<UpdateRepoResult> {
  const { repoRoot, registry, mode, config, logger } = options;
  const manifestsUpdated = discoverManifests(repoFiles, registry).filter((manifest) =>
    shouldUpdate(manifest, config),
  );

  const changes: PackageChange[] = [];
  const manualActionNeeded: ManualNote[] = [];

  for (const manifest of manifestsUpdated) {
    const plugin = registry.get(manifest.ecosystem);
    const label = `Updating ${manifest.ecosystem} dependencies in ${manifest.directory}`;
    const result = await logger.group(label, () =>
      plugin.update(manifest, mode, { repoRoot, logger }),
    );
    changes.push(...result.changes);
    manualActionNeeded.push(...result.manualActionNeeded);

    const emptyResult = result.changes.length === 0 && result.manualActionNeeded.length === 0;
    if (emptyResult && !result.diskChangeExplained) {
      const note = await checkForUnexplainedChanges(repoRoot, manifest, logger);
      if (note) {
        manualActionNeeded.push(note);
      }
    }
  }

  return { manifestsUpdated, changes, manualActionNeeded };
}

function shouldUpdate(manifest: ManifestLocation, config: ResolvedConfig): boolean {
  const ecosystemEnabled = config.ecosystems[manifest.ecosystem] ?? true;
  return ecosystemEnabled && !isPathIgnored(manifest.directory, config.ignorePaths);
}

/**
 * A plugin that reports zero changes is normally telling the truth: nothing was outdated. But
 * if its update command still left real, uncommitted changes on disk, that plugin's diffing
 * failed to explain what happened, silently reporting "nothing changed" while the working tree
 * says otherwise. Rather than let that mismatch reach a pull request unnoticed, flag it for a
 * human to look at, the same mechanism plugins already use for things they deliberately leave
 * alone.
 */
async function checkForUnexplainedChanges(
  repoRoot: string,
  manifest: ManifestLocation,
  logger: Logger,
): Promise<ManualNote | null> {
  const result = await runProcess(`git status --porcelain -- "${manifest.directory}"`, {
    cwd: repoRoot,
  });
  const changedFiles = parsePorcelainFilePaths(result.stdout);
  if (changedFiles.length === 0) {
    return null;
  }

  logger.warn(
    `${manifest.ecosystem} dependencies in ${manifest.directory} changed on disk (${changedFiles.join(', ')}), ` +
      'but this Action could not determine which package versions changed. Flagging for manual review.',
  );
  return {
    ecosystem: manifest.ecosystem,
    path: manifest.directory,
    name: null,
    reason:
      `Files changed after updating: ${changedFiles.join(', ')}. This Action could not ` +
      'determine which package versions changed. Review the diff manually before merging.',
  };
}

/** `git status --porcelain` lines are "XY path", XY being two status characters, sometimes a
 * rename arrow ("old -> new"); only the path (or the renamed-to path) is useful here. */
function parsePorcelainFilePaths(porcelainOutput: string): string[] {
  return porcelainOutput
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((path) => path.length > 0)
    .map((path) => path.split(' -> ').pop() ?? path);
}
