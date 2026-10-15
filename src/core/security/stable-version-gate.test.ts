import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logging/logger.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PackageChange,
} from '../types/ecosystem-plugin.js';

const mocks = vi.hoisted(() => ({ getVersionDates: vi.fn() }));
vi.mock('./release-date-registry.js', () => ({ getVersionDates: mocks.getVersionDates }));

const { applyStableVersionGate } = await import('./stable-version-gate.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_n, fn) => fn() };
const MANIFEST: ManifestLocation = {
  ecosystem: 'npm',
  language: 'JavaScript/TypeScript',
  manifestPath: 'package.json',
  directory: '.',
};
const CHANGE: PackageChange = {
  ecosystem: 'npm',
  path: '.',
  name: 'pkg-x',
  fromVersion: '1.0.0',
  toVersion: '1.5.0-beta.1',
  breaking: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

function makeRegistry(pinVersion?: DependencyUpdatePlugin['pinVersion']): PluginRegistry {
  const plugin: DependencyUpdatePlugin = {
    id: 'npm',
    language: 'JavaScript/TypeScript',
    detectManifests: () => [],
    update: async () => ({ changes: [], manualActionNeeded: [] }),
    ...(pinVersion ? { pinVersion } : {}),
  };
  return { register: vi.fn(), get: vi.fn().mockReturnValue(plugin), getAll: () => [plugin] };
}

function gate(changes: PackageChange[], registry: PluginRegistry) {
  return applyStableVersionGate(changes, {
    manifestsUpdated: [MANIFEST],
    pluginRegistry: registry,
    repoRoot: '/repo',
    logger,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyStableVersionGate', () => {
  it('passes stable changes through without any registry lookup', async () => {
    const stableChange = { ...CHANGE, toVersion: '1.5.0' };
    const result = await gate([stableChange], makeRegistry(vi.fn()));

    expect(result).toEqual({ changes: [stableChange], stabilityNotes: [] });
    expect(mocks.getVersionDates).not.toHaveBeenCalled();
  });

  it('caps an unstable update to the newest stable version and explains why', async () => {
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.4.0', daysAgo(10)],
        ['1.5.0-rc.1', daysAgo(5)],
        ['1.5.0-beta.1', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);

    const result = await gate([CHANGE], makeRegistry(pinVersion));

    expect(pinVersion).toHaveBeenCalledWith(
      MANIFEST,
      { name: 'pkg-x', fromVersion: '1.5.0-beta.1', version: '1.4.0' },
      expect.any(Object),
    );
    expect(result.changes).toEqual([{ ...CHANGE, toVersion: '1.4.0' }]);
    expect(result.stabilityNotes[0]?.reason).toContain('contains "beta"');
    expect(result.stabilityNotes[0]?.reason).toContain('capped to 1.4.0');
  });

  it('reverts the update when there is no newer stable version', async () => {
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.5.0-beta.1', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);

    const result = await gate([CHANGE], makeRegistry(pinVersion));

    expect(pinVersion).toHaveBeenCalledWith(
      MANIFEST,
      expect.objectContaining({ version: '1.0.0' }),
      expect.any(Object),
    );
    expect(result.changes).toEqual([]);
    expect(result.stabilityNotes[0]?.reason).toContain('no update was applied');
  });

  it('reverts rather than fails open when the registry lookup fails', async () => {
    mocks.getVersionDates.mockResolvedValue(null);
    const pinVersion = vi.fn().mockResolvedValue(true);

    const result = await gate([CHANGE], makeRegistry(pinVersion));

    expect(result.changes).toEqual([]);
    expect(result.stabilityNotes).toHaveLength(1);
  });

  it('keeps the change and flags it when the ecosystem cannot pin', async () => {
    const result = await gate([CHANGE], makeRegistry(undefined));

    expect(result.changes).toEqual([CHANGE]);
    expect(result.stabilityNotes[0]?.reason).toContain('left as-is');
  });
});
