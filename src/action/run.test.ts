import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../core/logging/logger.js';

const mocks = vi.hoisted(() => ({
  listRepoFiles: vi.fn(),
  loadConfig: vi.fn(),
  updateRepo: vi.fn(),
  runCommands: vi.fn(),
  parseCommands: vi.fn(),
  writeSummaryToDisk: vi.fn(),
  setActionOutputs: vi.fn(),
  setFailed: vi.fn(),
  createBranch: vi.fn(),
  commitAll: vi.fn(),
  push: vi.fn(),
  createOrUpdatePullRequest: vi.fn(),
  resolveBaseBranch: vi.fn(),
}));

vi.mock('../core/discovery/list-repo-files.js', () => ({ listRepoFiles: mocks.listRepoFiles }));
vi.mock('../core/config/config-loader.js', () => ({ loadConfig: mocks.loadConfig }));
vi.mock('../core/update/update-repo.js', () => ({ updateRepo: mocks.updateRepo }));
vi.mock('../core/commands/command-runner.js', () => ({
  runCommands: mocks.runCommands,
  parseCommands: mocks.parseCommands,
}));
vi.mock('../core/reporting/report-builder.js', () => ({
  writeSummaryToDisk: mocks.writeSummaryToDisk,
}));
vi.mock('./outputs.js', () => ({ setActionOutputs: mocks.setActionOutputs }));
vi.mock('@actions/core', () => ({
  setFailed: mocks.setFailed,
  getInput: vi.fn(() => ''),
  getBooleanInput: vi.fn(() => true),
}));
vi.mock('../core/git/git-client.js', () => ({
  createGitClient: () => ({
    createBranch: mocks.createBranch,
    commitAll: mocks.commitAll,
    push: mocks.push,
  }),
}));
vi.mock('../core/github/pr-manager.js', () => ({
  createOrUpdatePullRequest: mocks.createOrUpdatePullRequest,
}));
vi.mock('../core/github/base-branch.js', () => ({ resolveBaseBranch: mocks.resolveBaseBranch }));
vi.mock('../core/plugins/all-plugins.js', () => ({ createAllPlugins: () => [] }));

vi.mock('./inputs.js', () => ({
  readActionInputs: () => ({
    updateStrategy: 'non-breaking',
    checkCommands: 'npm test',
    createPullRequest: true,
    baseBranch: '',
    branchName: 'update-dependencies/non-breaking',
    configPath: '.github/update-dependencies.yml',
    workingDirectory: '.',
    githubToken: 'token',
  }),
}));

const { run } = await import('./run.js');

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const CHANGE = {
  ecosystem: 'npm' as const,
  path: '.',
  name: 'left-pad',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  breaking: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listRepoFiles.mockResolvedValue([]);
  mocks.loadConfig.mockResolvedValue({ version: 1, ecosystems: {}, ignorePaths: [] });
  mocks.writeSummaryToDisk.mockResolvedValue('/repo/update-dependencies-summary.json');
  mocks.parseCommands.mockReturnValue(['npm test']);
  mocks.resolveBaseBranch.mockResolvedValue('main');
  mocks.createOrUpdatePullRequest.mockResolvedValue({
    number: 42,
    url: 'https://github.com/example/repo/pull/42',
  });
});

describe('run', () => {
  it('sets updated=false and skips commands and PR creation when nothing changed', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [],
      changes: [],
      manualActionNeeded: [],
    });

    await run(logger);

    expect(mocks.runCommands).not.toHaveBeenCalled();
    expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({ updated: false, commandsPassed: true }),
    );
  });

  it('fails and never creates a pull request when a command fails', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({
      results: [{ command: 'npm test', exitCode: 1 }],
      allSucceeded: false,
      failedCommand: 'npm test',
    });

    await run(logger);

    expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
    expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('npm test'));
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({ updated: true, commandsPassed: false }),
    );
  });

  it('commits, pushes, and opens a pull request when every command passes', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({
      results: [{ command: 'npm test', exitCode: 0 }],
      allSucceeded: true,
      failedCommand: null,
    });

    await run(logger);

    expect(mocks.createBranch).toHaveBeenCalledWith('update-dependencies/non-breaking');
    expect(mocks.commitAll).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith('update-dependencies/non-breaking');
    expect(mocks.createOrUpdatePullRequest).toHaveBeenCalled();
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({ updated: true, commandsPassed: true, pullRequestNumber: 42 }),
    );
    expect(mocks.setFailed).not.toHaveBeenCalled();
  });
});
