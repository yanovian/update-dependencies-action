import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logging/logger.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type {
  DependencyUpdatePlugin,
  ManifestLocation,
  PackageChange,
} from '../types/ecosystem-plugin.js';

const mocks = vi.hoisted(() => ({
  findVulnerableEntries: vi.fn(),
  getVersionDates: vi.fn(),
}));

vi.mock('./osv-client.js', () => ({ findVulnerableEntries: mocks.findVulnerableEntries }));
vi.mock('./release-date-registry.js', () => ({ getVersionDates: mocks.getVersionDates }));

const { applyReleaseAgeGate } = await import('./release-age-gate.js');

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
  toVersion: '1.5.0',
  breaking: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

function makeRegistry(
  plugin: Partial<DependencyUpdatePlugin> & { pinVersion?: DependencyUpdatePlugin['pinVersion'] },
): PluginRegistry {
  const fullPlugin: DependencyUpdatePlugin = {
    id: 'npm',
    language: 'JavaScript/TypeScript',
    detectManifests: () => [],
    update: async () => ({ changes: [], manualActionNeeded: [] }),
    ...plugin,
  };
  return {
    register: vi.fn(),
    get: vi.fn().mockReturnValue(fullPlugin),
    getAll: () => [fullPlugin],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyReleaseAgeGate', () => {
  it('bypasses the gate when the current version has a known vulnerability', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([
      {
        query: { ecosystem: 'npm', name: 'pkg-x', version: '1.0.0' },
        vulnerabilityIds: ['GHSA-x'],
      },
    ]);
    const pinVersion = vi.fn();
    const registry = makeRegistry({ pinVersion });

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toEqual([]);
    expect(pinVersion).not.toHaveBeenCalled();
    expect(mocks.getVersionDates).not.toHaveBeenCalled();
  });

  it('leaves a change alone when its version already clears the minimum age', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.5.0', daysAgo(10)],
      ]),
    );
    const registry = makeRegistry({});

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toEqual([]);
  });

  it('downgrades to the newest compliant same-major version and preserves breaking-ness', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.4.0', daysAgo(5)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);
    const registry = makeRegistry({ pinVersion });

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(pinVersion).toHaveBeenCalledWith(MANIFEST, 'pkg-x', '1.4.0', {
      repoRoot: '/repo',
      logger,
    });
    expect(result.changes).toEqual([{ ...CHANGE, toVersion: '1.4.0', breaking: false }]);
    expect(result.ageGateNotes).toHaveLength(1);
    expect(result.ageGateNotes[0]?.reason).toContain('1.4.0');
  });

  it('reverts and drops the change when no compliant version exists', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);
    const registry = makeRegistry({ pinVersion });

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(pinVersion).toHaveBeenCalledWith(MANIFEST, 'pkg-x', '1.0.0', {
      repoRoot: '/repo',
      logger,
    });
    expect(result.changes).toEqual([]);
    expect(result.ageGateNotes).toHaveLength(1);
    expect(result.ageGateNotes[0]?.reason).toContain('no update was applied');
  });

  it('keeps the too-fresh change visible, not silently dropped, when the revert itself fails', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(false);
    const registry = makeRegistry({ pinVersion });

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    // The revert failed, so the too-fresh version is still on disk exactly as before; dropping
    // it here would mean it gets committed into the pull request while claiming nothing changed.
    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toHaveLength(1);
    expect(result.ageGateNotes[0]?.reason).toContain('no update was applied');
  });

  it('does not pick a candidate published later than the current version when the current version is not itself dated', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    // fromVersion (1.0.0) is absent from the registry's own version list, so its publish date
    // can't be confirmed; no candidate can be proven newer than it as a result.
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.4.0', daysAgo(5)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);
    const registry = makeRegistry({ pinVersion });

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(pinVersion).toHaveBeenCalledWith(MANIFEST, 'pkg-x', '1.0.0', {
      repoRoot: '/repo',
      logger,
    });
    expect(result.changes).toEqual([]);
  });

  it('declines to pin, rather than guessing, when more than one manifest matches the same directory', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.4.0', daysAgo(5)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const pinVersion = vi.fn().mockResolvedValue(true);
    const registry = makeRegistry({ pinVersion });
    const secondManifest: ManifestLocation = { ...MANIFEST, manifestPath: 'other.csproj' };

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST, secondManifest],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(pinVersion).not.toHaveBeenCalled();
    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toHaveLength(1);
  });

  it('flags instead of adjusting when the plugin has no pinVersion capability', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(
      new Map([
        ['1.0.0', daysAgo(40)],
        ['1.4.0', daysAgo(5)],
        ['1.5.0', daysAgo(1)],
      ]),
    );
    const registry = makeRegistry({});

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toHaveLength(1);
    expect(result.ageGateNotes[0]?.reason).toContain("doesn't support pinning");
  });

  it('fails open and flags as unverified when the release-date lookup fails', async () => {
    mocks.findVulnerableEntries.mockResolvedValue([]);
    mocks.getVersionDates.mockResolvedValue(null);
    const registry = makeRegistry({});

    const result = await applyReleaseAgeGate([CHANGE], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(result.changes).toEqual([CHANGE]);
    expect(result.ageGateNotes).toHaveLength(1);
    expect(result.ageGateNotes[0]?.reason).toContain('Could not verify');
  });

  it('leaves range-only (indirect) changes untouched without any lookups', async () => {
    const indirectChange: PackageChange = { ...CHANGE, indirect: true };
    const registry = makeRegistry({});
    mocks.findVulnerableEntries.mockResolvedValue([]);

    const result = await applyReleaseAgeGate([indirectChange], {
      minAgeDays: 3,
      manifestsUpdated: [MANIFEST],
      pluginRegistry: registry,
      repoRoot: '/repo',
      logger,
    });

    expect(result.changes).toEqual([indirectChange]);
    expect(mocks.getVersionDates).not.toHaveBeenCalled();
  });
});
