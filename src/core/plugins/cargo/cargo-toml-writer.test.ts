import { describe, expect, it } from 'vitest';
import { bumpCargoTomlVersions } from './cargo-toml-writer.js';
import { parseCargoToml } from './cargo-manifest.js';

describe('bumpCargoTomlVersions', () => {
  it('rewrites a bare string requirement', () => {
    const original = `[dependencies]\nserde = "1.0"\n`;
    const result = bumpCargoTomlVersions(original, new Map([['serde', '2.0.0']]));
    expect(parseCargoToml(result).dependencies?.serde).toBe('2.0.0');
  });

  it('rewrites only the version field of a table requirement, preserving the rest', () => {
    const original = `[dependencies]\ntokio = { version = "1", features = ["full"] }\n`;
    const result = bumpCargoTomlVersions(original, new Map([['tokio', '2.0.0']]));
    const tokio = parseCargoToml(result).dependencies?.tokio;
    expect(tokio).toMatchObject({ version: '2.0.0', features: ['full'] });
  });

  it('leaves a dependency not in the updates map untouched', () => {
    const original = `[dependencies]\nserde = "1.0"\nlibc = "0.2"\n`;
    const result = bumpCargoTomlVersions(original, new Map([['serde', '2.0.0']]));
    expect(parseCargoToml(result).dependencies?.libc).toBe('0.2');
  });
});
