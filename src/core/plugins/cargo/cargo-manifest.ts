import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

export type CargoDependencyValue = string | { version?: string; [key: string]: unknown };

export interface CargoTomlShape {
  readonly dependencies?: Record<string, CargoDependencyValue>;
  readonly 'dev-dependencies'?: Record<string, CargoDependencyValue>;
  readonly 'build-dependencies'?: Record<string, CargoDependencyValue>;
}

const DEPENDENCY_SECTIONS = ['dependencies', 'dev-dependencies', 'build-dependencies'] as const;

export function detectCargoManifests(repoFiles: readonly string[]): ManifestLocation[] {
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'Cargo.toml')
    .map((manifestPath) => ({
      ecosystem: 'cargo' as const,
      language: 'Rust',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}

export function parseCargoToml(contents: string): CargoTomlShape {
  return parseToml(contents) as CargoTomlShape;
}

export function readDirectDependencyNames(cargoToml: CargoTomlShape): string[] {
  const names = new Set<string>();
  for (const section of DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(cargoToml[section] ?? {})) {
      names.add(name);
    }
  }
  return [...names];
}
