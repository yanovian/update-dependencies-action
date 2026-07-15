import { parse as parseYaml } from 'yaml';

/** v9+ (lockfileVersion 9.x) stores specifier and resolved version together per dependency. */
type PnpmDependencyValue = string | { readonly version: string };

interface PnpmDependencyContainer {
  readonly dependencies?: Record<string, PnpmDependencyValue>;
  readonly devDependencies?: Record<string, PnpmDependencyValue>;
}

interface PnpmLockShape extends PnpmDependencyContainer {
  // v6+ (workspace-aware) nests the root package's dependencies under importers["."]; v5 and
  // earlier has no importers wrapper at all and keeps dependencies at the document root.
  readonly importers?: Record<string, PnpmDependencyContainer>;
}

/**
 * pnpm suffixes a peer-influenced resolution. v9+ uses parentheses, e.g.
 * "1.2.3(react@18.2.0)"; v5 and earlier used an underscore, e.g. "1.2.3_react@17.0.2". Strip
 * either.
 */
function stripPeerSuffix(version: string): string {
  const parenIndex = version.indexOf('(');
  if (parenIndex !== -1) {
    return version.slice(0, parenIndex);
  }
  const underscoreIndex = version.indexOf('_');
  return underscoreIndex === -1 ? version : version.slice(0, underscoreIndex);
}

function resolvedVersionOf(value: PnpmDependencyValue): string {
  return typeof value === 'string' ? value : value.version;
}

/**
 * Supports every pnpm-lock.yaml layout seen in practice: the current "importers" format
 * (pnpm 6+, root package keyed by "."), where a dependency value can be either a combined
 * {specifier, version} object (v9+) or a plain resolved-version string (v6 to v8); and the
 * pre-workspace format (pnpm 5 and earlier) with no importers wrapper, where dependencies sit
 * directly at the document root. Only the declared direct dependencies are returned.
 */
export function resolvePnpmLockVersions(
  lockfileContents: string,
  declared: ReadonlyMap<string, string>,
): Map<string, string> {
  const lockfile = parseYaml(lockfileContents) as PnpmLockShape;
  const container = lockfile.importers?.['.'] ?? lockfile;
  const merged: Record<string, PnpmDependencyValue> = {
    ...container.dependencies,
    ...container.devDependencies,
  };

  const resolved = new Map<string, string>();
  for (const name of declared.keys()) {
    const value = merged[name];
    if (value) {
      resolved.set(name, stripPeerSuffix(resolvedVersionOf(value)));
    }
  }
  return resolved;
}
