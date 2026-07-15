interface PackageLockJsonShape {
  readonly packages?: Record<string, { readonly version?: string }>;
}

/** package-lock.json (v2/v3) keys every resolved package by its node_modules path, so a direct
 * dependency's resolved version is found at "node_modules/<name>". */
export function resolvePackageLockVersions(
  lockfileContents: string,
  declared: ReadonlyMap<string, string>,
): Map<string, string> {
  const packageLock = JSON.parse(lockfileContents) as PackageLockJsonShape;
  const resolved = new Map<string, string>();
  for (const name of declared.keys()) {
    const version = packageLock.packages?.[`node_modules/${name}`]?.version;
    if (version) {
      resolved.set(name, version);
    }
  }
  return resolved;
}
