import type { PluginRegistry } from '../plugins/registry.js';
import type { ManifestLocation } from '../types/ecosystem-plugin.js';

/** Asks every registered ecosystem plugin to find its own manifests among the repo's files. */
export function discoverManifests(
  repoFiles: readonly string[],
  registry: PluginRegistry,
): ManifestLocation[] {
  return registry.getAll().flatMap((plugin) => plugin.detectManifests(repoFiles));
}
