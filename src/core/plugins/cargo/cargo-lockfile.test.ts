import { describe, expect, it } from 'vitest';
import { resolveCargoLockVersions } from './cargo-lockfile.js';

describe('resolveCargoLockVersions', () => {
  it('reads the version of each declared package', () => {
    const lockfile = `
[[package]]
name = "serde"
version = "1.0.190"

[[package]]
name = "libc"
version = "0.2.150"
`;
    const result = resolveCargoLockVersions(lockfile, ['serde']);
    expect(result).toEqual(new Map([['serde', '1.0.190']]));
  });

  it('keeps the first entry when a crate appears more than once', () => {
    const lockfile = `
[[package]]
name = "serde"
version = "1.0.190"

[[package]]
name = "serde"
version = "0.9.0"
`;
    expect(resolveCargoLockVersions(lockfile, ['serde'])).toEqual(new Map([['serde', '1.0.190']]));
  });
});
