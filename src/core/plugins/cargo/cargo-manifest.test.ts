import { describe, expect, it } from 'vitest';
import {
  detectCargoManifests,
  parseCargoToml,
  readDirectDependencyNames,
} from './cargo-manifest.js';

describe('detectCargoManifests', () => {
  it('finds Cargo.toml anywhere in the repo', () => {
    expect(detectCargoManifests(['crates/core/Cargo.toml'])).toEqual([
      {
        ecosystem: 'cargo',
        language: 'Rust',
        manifestPath: 'crates/core/Cargo.toml',
        directory: 'crates/core',
      },
    ]);
  });
});

describe('readDirectDependencyNames', () => {
  it('collects names across dependencies, dev-dependencies, and build-dependencies with no duplicates', () => {
    const cargoToml = parseCargoToml(`
[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["full"] }

[dev-dependencies]
serde = "1.0"
proptest = "1"

[build-dependencies]
cc = "1"
`);
    expect(new Set(readDirectDependencyNames(cargoToml))).toEqual(
      new Set(['serde', 'tokio', 'proptest', 'cc']),
    );
  });
});
