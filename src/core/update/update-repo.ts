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
  }

  return { manifestsUpdated, changes, manualActionNeeded };
}

function shouldUpdate(manifest: ManifestLocation, config: ResolvedConfig): boolean {
  const ecosystemEnabled = config.ecosystems[manifest.ecosystem] ?? true;
  return ecosystemEnabled && !isPathIgnored(manifest.directory, config.ignorePaths);
}
