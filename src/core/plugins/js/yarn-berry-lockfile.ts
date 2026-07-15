import { parse as parseYaml } from 'yaml';

interface YarnBerryEntry {
  readonly version?: string;
}

function splitDescriptorKey(key: string): string[] {
  return key.split(', ').map((descriptor) => descriptor.trim());
}

/** Yarn Berry lockfiles always start with this block; classic v1 lockfiles never have one. */
export function isYarnBerryLockfile(fileContents: string): boolean {
  return fileContents.includes('__metadata:');
}

/**
 * Yarn Berry (v2+) lockfiles are real YAML, unlike classic v1's custom text format. Descriptors
 * are keyed as "name@npm:range" (or "name@workspace:.", "name@patch:...", etc. for non-registry
 * sources), and one YAML key can bundle several comma-separated descriptors that all resolved
 * to the same version.
 */
export function resolveYarnBerryVersions(
  fileContents: string,
  declared: ReadonlyMap<string, string>,
): Map<string, string> {
  const lockfile = parseYaml(fileContents) as Record<string, YarnBerryEntry>;
  const versionByDescriptor = new Map<string, string>();

  for (const [key, entry] of Object.entries(lockfile)) {
    if (key === '__metadata' || !entry?.version) {
      continue;
    }
    for (const descriptor of splitDescriptorKey(key)) {
      versionByDescriptor.set(descriptor, entry.version);
    }
  }

  const resolved = new Map<string, string>();
  for (const [name, range] of declared) {
    const version = versionByDescriptor.get(`${name}@npm:${range}`);
    if (version) {
      resolved.set(name, version);
    }
  }
  return resolved;
}
