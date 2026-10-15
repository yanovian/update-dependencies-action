import type {
  DependencyUpdatePlugin,
  EcosystemId,
  ManifestLocation,
  PackageChange,
  PinTarget,
  UpdateContext,
} from '../types/ecosystem-plugin.js';
import { getVersionDates } from './release-date-registry.js';

/** Shared by every post-hoc gate (release age, stable versions) that walks an already-applied
 * change back to a different version via the plugin's own `pinVersion`. */

/** The plugin's own resolver already wrote `change.toVersion` to disk, so that (not the original
 * pre-run `change.fromVersion`) is what's currently declared there. */
export function pinTarget(change: PackageChange, version: string): PinTarget {
  return { name: change.name, fromVersion: change.toVersion, version };
}

export interface VersionDateCache {
  get(ecosystem: EcosystemId, name: string): Promise<Map<string, Date> | null>;
}

/** Memoizes per (ecosystem, name), since the same package can appear as more than one change
 * across different directories in the same run. */
export function createVersionDateCache(): VersionDateCache {
  const cache = new Map<string, Promise<Map<string, Date> | null>>();
  return {
    get(ecosystem, name) {
      const key = `${ecosystem}::${name}`;
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      const promise = getVersionDates(ecosystem, name);
      cache.set(key, promise);
      return promise;
    },
  };
}

/**
 * Returns undefined (declining to pin, falling back to flagging) rather than guessing when more
 * than one manifest matches: most ecosystems have exactly one manifest per (ecosystem, directory),
 * but NuGet allows several .csproj files in the same directory, and picking the first one would
 * risk rewriting the wrong project file.
 */
export function findManifestLocation(
  manifestsUpdated: readonly ManifestLocation[],
  change: PackageChange,
): ManifestLocation | undefined {
  const matches = manifestsUpdated.filter(
    (manifest) => manifest.ecosystem === change.ecosystem && manifest.directory === change.path,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export async function tryPin(
  plugin: DependencyUpdatePlugin,
  location: ManifestLocation,
  target: PinTarget,
  ctx: UpdateContext,
): Promise<boolean> {
  if (!plugin.pinVersion) {
    return false;
  }
  try {
    return await plugin.pinVersion(location, target, ctx);
  } catch (error) {
    ctx.logger.warn(
      `Failed to pin ${target.name} to ${target.version} in ${location.directory}: ` +
        `${(error as Error).message}`,
    );
    return false;
  }
}
