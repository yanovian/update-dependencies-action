import { isYarnBerryLockfile, resolveYarnBerryVersions } from './yarn-berry-lockfile.js';

interface YarnLockEntry {
  readonly descriptors: readonly string[];
  readonly version: string;
}

function parseHeaderLine(line: string): string[] {
  return line
    .trimEnd()
    .slice(0, -1)
    .split(',')
    .map((descriptor) => descriptor.trim().replace(/^"|"$/g, ''));
}

function parseYarnLockEntries(fileContents: string): YarnLockEntry[] {
  const entries: YarnLockEntry[] = [];
  let currentDescriptors: string[] = [];
  let currentVersion: string | null = null;

  const flush = (): void => {
    if (currentDescriptors.length > 0 && currentVersion) {
      entries.push({ descriptors: currentDescriptors, version: currentVersion });
    }
    currentDescriptors = [];
    currentVersion = null;
  };

  for (const line of fileContents.split('\n')) {
    if (line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    if (!line.startsWith(' ') && line.trimEnd().endsWith(':')) {
      flush();
      currentDescriptors = parseHeaderLine(line);
      continue;
    }
    const versionMatch = /^\s+version\s+"?([^"\s]+)"?/.exec(line);
    if (versionMatch?.[1] && currentDescriptors.length > 0) {
      currentVersion = versionMatch[1];
    }
  }
  flush();

  return entries;
}

/**
 * yarn.lock keys each resolved version by the exact "name@range" descriptor(s) that requested
 * it (classic v1 lockfile format), so a direct dependency's resolved version is found by
 * matching package.json's declared name and range string against those descriptors.
 */
function resolveYarnClassicVersions(
  fileContents: string,
  declared: ReadonlyMap<string, string>,
): Map<string, string> {
  const versionByDescriptor = new Map<string, string>();
  for (const entry of parseYarnLockEntries(fileContents)) {
    for (const descriptor of entry.descriptors) {
      versionByDescriptor.set(descriptor, entry.version);
    }
  }

  const resolved = new Map<string, string>();
  for (const [name, range] of declared) {
    const version = versionByDescriptor.get(`${name}@${range}`);
    if (version) {
      resolved.set(name, version);
    }
  }
  return resolved;
}

/** yarn.lock is either the classic v1 custom text format or, from Yarn Berry (v2+) onward, real
 * YAML. Detect which and parse accordingly. */
export function resolveYarnVersions(
  fileContents: string,
  declared: ReadonlyMap<string, string>,
): Map<string, string> {
  return isYarnBerryLockfile(fileContents)
    ? resolveYarnBerryVersions(fileContents, declared)
    : resolveYarnClassicVersions(fileContents, declared);
}
