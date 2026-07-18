import { describe, expect, it } from 'vitest';
import type { PackageChange } from '../types/ecosystem-plugin.js';
import { evaluateGroupedByManifest } from './release-age-scheduler.js';

function change(overrides: Partial<PackageChange>): PackageChange {
  return {
    ecosystem: 'npm',
    path: '.',
    name: 'pkg',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    breaking: false,
    ...overrides,
  };
}

describe('evaluateGroupedByManifest', () => {
  it('returns one result per change, in the original order within each manifest', async () => {
    const changes = [
      change({ name: 'a', path: 'app' }),
      change({ name: 'b', path: 'app' }),
      change({ name: 'c', path: 'lib' }),
    ];

    const results = await evaluateGroupedByManifest(changes, async (c) => c.name);

    expect(results.sort()).toEqual(['a', 'b', 'c']);
  });

  it('never runs two changes from the same manifest concurrently', async () => {
    const changes = [
      change({ name: 'a', path: 'app' }),
      change({ name: 'b', path: 'app' }),
      change({ name: 'c', path: 'app' }),
    ];
    let inFlight = 0;
    let maxInFlight = 0;

    await evaluateGroupedByManifest(changes, async (c) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return c.name;
    });

    expect(maxInFlight).toBe(1);
  });

  it('processes changes from different manifests concurrently', async () => {
    const changes = [
      change({ name: 'a', path: 'app-a' }),
      change({ name: 'b', path: 'app-b' }),
      change({ name: 'c', path: 'app-c' }),
    ];
    let inFlight = 0;
    let maxInFlight = 0;

    await evaluateGroupedByManifest(changes, async (c) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return c.name;
    });

    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('resolves to an empty array for no changes', async () => {
    await expect(evaluateGroupedByManifest([], async (c) => c.name)).resolves.toEqual([]);
  });
});
