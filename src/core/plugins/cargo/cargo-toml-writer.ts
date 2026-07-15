import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { CargoDependencyValue } from './cargo-manifest.js';

const DEPENDENCY_SECTIONS = ['dependencies', 'dev-dependencies', 'build-dependencies'] as const;

/** Rewrites just the version requirement of each dependency named in `updates`, in every
 * dependency section, whether declared as a bare string ("1.0") or a table
 * ({ version = "1.0", features = [...] }). Parses and re-serializes through smol-toml rather
 * than doing text surgery, since Cargo.toml is real structured data; this can reformat
 * whitespace but never corrupts the file the way a regex replace risks doing. */
export function bumpCargoTomlVersions(
  original: string,
  updates: ReadonlyMap<string, string>,
): string {
  const parsed = parseToml(original) as Record<
    string,
    Record<string, CargoDependencyValue> | undefined
  >;

  for (const section of DEPENDENCY_SECTIONS) {
    const table = parsed[section];
    if (!table) {
      continue;
    }
    for (const [name, newVersion] of updates) {
      applyVersion(table, name, newVersion);
    }
  }

  return stringifyToml(parsed);
}

function applyVersion(
  table: Record<string, CargoDependencyValue>,
  name: string,
  newVersion: string,
): void {
  const current = table[name];
  if (typeof current === 'string') {
    table[name] = newVersion;
  } else if (current && typeof current === 'object') {
    current.version = newVersion;
  }
}
