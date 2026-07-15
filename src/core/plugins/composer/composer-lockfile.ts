interface ComposerLockPackage {
  readonly name: string;
  readonly version: string;
}

interface ComposerLockShape {
  readonly packages?: ComposerLockPackage[];
  readonly 'packages-dev'?: ComposerLockPackage[];
}

export function resolveComposerLockVersions(
  lockfileContents: string,
  declaredNames: readonly string[],
): Map<string, string> {
  const lockfile = JSON.parse(lockfileContents) as ComposerLockShape;
  const declaredSet = new Set(declaredNames);
  const resolved = new Map<string, string>();

  for (const pkg of [...(lockfile.packages ?? []), ...(lockfile['packages-dev'] ?? [])]) {
    if (declaredSet.has(pkg.name)) {
      resolved.set(pkg.name, pkg.version);
    }
  }
  return resolved;
}
