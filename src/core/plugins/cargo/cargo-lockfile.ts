import { parse as parseToml } from 'smol-toml';

interface CargoLockPackage {
  readonly name: string;
  readonly version: string;
}

interface CargoLockShape {
  readonly package?: CargoLockPackage[];
}

/** A crate name can appear more than once in Cargo.lock when semver-incompatible versions
 * coexist transitively; the first entry is used, which is the direct dependency's own
 * resolution in the overwhelming majority of real Cargo.lock files. */
export function resolveCargoLockVersions(
  lockfileContents: string,
  declaredNames: readonly string[],
): Map<string, string> {
  const lockfile = parseToml(lockfileContents) as CargoLockShape;
  const declaredSet = new Set(declaredNames);
  const resolved = new Map<string, string>();

  for (const pkg of lockfile.package ?? []) {
    if (declaredSet.has(pkg.name) && !resolved.has(pkg.name)) {
      resolved.set(pkg.name, pkg.version);
    }
  }
  return resolved;
}
