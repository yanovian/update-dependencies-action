import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logging/logger.js';
import type { DependencyUpdatePlugin, ManifestLocation } from '../types/ecosystem-plugin.js';

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }));
vi.mock('../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { updateRepo } = await import('./update-repo.js');

const MANIFEST: ManifestLocation = {
  ecosystem: 'npm',
  language: 'JavaScript/TypeScript',
  manifestPath: 'app/package.json',
  directory: 'app',
};

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const config = { version: 1 as const, ecosystems: {}, ignorePaths: [] };

function registryWith(plugin: DependencyUpdatePlugin) {
  return {
    register: vi.fn(),
    get: () => plugin,
    getAll: () => [plugin],
  };
}

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('updateRepo', () => {
  it('does not check git status when the plugin already reported changes', async () => {
    const plugin: DependencyUpdatePlugin = {
      id: 'npm',
      language: 'JavaScript/TypeScript',
      detectManifests: () => [MANIFEST],
      update: async () => ({
        changes: [
          {
            ecosystem: 'npm',
            path: 'app',
            name: 'left-pad',
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            breaking: false,
          },
        ],
        manualActionNeeded: [],
      }),
    };

    const result = await updateRepo(['app/package.json'], {
      repoRoot: '/repo',
      registry: registryWith(plugin),
      mode: 'non-breaking',
      config,
      logger,
    });

    expect(runProcessMock).not.toHaveBeenCalled();
    expect(result.changes).toHaveLength(1);
    expect(result.manualActionNeeded).toEqual([]);
  });

  it('leaves a clean report alone when the plugin found nothing and disk is clean', async () => {
    runProcessMock.mockResolvedValue({ exitCode: 0, stdout: '' });
    const plugin: DependencyUpdatePlugin = {
      id: 'npm',
      language: 'JavaScript/TypeScript',
      detectManifests: () => [MANIFEST],
      update: async () => ({ changes: [], manualActionNeeded: [] }),
    };

    const result = await updateRepo(['app/package.json'], {
      repoRoot: '/repo',
      registry: registryWith(plugin),
      mode: 'non-breaking',
      config,
      logger,
    });

    expect(runProcessMock).toHaveBeenCalledWith(expect.stringContaining('git status --porcelain'), {
      cwd: '/repo',
    });
    expect(result.manualActionNeeded).toEqual([]);
  });

  it('flags unexplained disk changes as a manual-action note, naming the exact files changed', async () => {
    runProcessMock.mockResolvedValue({
      exitCode: 0,
      stdout: ' M app/package-lock.json\n M app/package.json\n',
    });
    const plugin: DependencyUpdatePlugin = {
      id: 'npm',
      language: 'JavaScript/TypeScript',
      detectManifests: () => [MANIFEST],
      update: async () => ({ changes: [], manualActionNeeded: [] }),
    };

    const result = await updateRepo(['app/package.json'], {
      repoRoot: '/repo',
      registry: registryWith(plugin),
      mode: 'non-breaking',
      config,
      logger,
    });

    expect(result.changes).toEqual([]);
    expect(result.manualActionNeeded).toEqual([
      expect.objectContaining({
        ecosystem: 'npm',
        path: 'app',
        name: null,
        reason: expect.stringContaining('app/package-lock.json, app/package.json'),
      }),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('app/package-lock.json, app/package.json'),
    );
  });
});
