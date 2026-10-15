import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../core/logging/logger.js';

const mocks = vi.hoisted(() => ({
  listRepoFiles: vi.fn(),
  loadConfig: vi.fn(),
  updateRepo: vi.fn(),
  runCommands: vi.fn(),
  parseCommands: vi.fn(),
  writeSummaryToDisk: vi.fn(),
  writePullRequestBodyToDisk: vi.fn(),
  setActionOutputs: vi.fn(),
  setFailed: vi.fn(),
  createBranch: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  undoLastCommit: vi.fn(),
  createOrUpdatePullRequest: vi.fn(),
  findStalePullRequests: vi.fn(),
  resolveBaseBranch: vi.fn(),
  applyReleaseAgeGate: vi.fn(),
  applyStableVersionGate: vi.fn(),
  readActionInputs: vi.fn(),
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
  writePullRequestBodyToDisk: mocks.writePullRequestBodyToDisk,
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
    commit: mocks.commit,
    push: mocks.push,
    undoLastCommit: mocks.undoLastCommit,
  }),
}));
vi.mock('../core/github/pr-manager.js', () => ({
  createOrUpdatePullRequest: mocks.createOrUpdatePullRequest,
  findStalePullRequests: mocks.findStalePullRequests,
}));
vi.mock('../core/github/base-branch.js', () => ({ resolveBaseBranch: mocks.resolveBaseBranch }));
vi.mock('../core/security/release-age-gate.js', () => ({
  applyReleaseAgeGate: mocks.applyReleaseAgeGate,
}));
vi.mock('../core/security/stable-version-gate.js', () => ({
  applyStableVersionGate: mocks.applyStableVersionGate,
}));
vi.mock('../core/plugins/all-plugins.js', () => ({ createAllPlugins: () => [] }));
vi.mock('../core/util/current-date.js', () => ({ getUtcDateString: () => '2026-07-16' }));

vi.mock('./inputs.js', () => ({ readActionInputs: mocks.readActionInputs }));

const DEFAULT_INPUTS = {
  updateStrategy: 'non-breaking' as const,
  checkCommands: 'npm test',
  createPullRequest: true,
  baseBranch: '',
  branchName: 'chore/update-deps/non-breaking',
  configPath: '.github/update-dependencies.yml',
  workingDirectory: '.',
  githubToken: 'token',
  minReleaseAgeDays: 0,
};

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
const MANIFEST = {
  ecosystem: 'npm' as const,
  language: 'JavaScript/TypeScript',
  manifestPath: 'package.json',
  directory: '.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readActionInputs.mockReturnValue(DEFAULT_INPUTS);
  mocks.listRepoFiles.mockResolvedValue([]);
  mocks.loadConfig.mockResolvedValue({
    version: 1,
    ecosystems: {},
    ignorePaths: [],
    updateStrategies: {},
    allowUnstableVersions: false,
  });
  mocks.applyStableVersionGate.mockImplementation(async (changes: unknown[]) => ({
    changes,
    stabilityNotes: [],
  }));
  mocks.writeSummaryToDisk.mockResolvedValue('/repo/update-dependencies-summary.json');
  mocks.writePullRequestBodyToDisk.mockResolvedValue('/repo/update-dependencies-pr-body.md');
  mocks.parseCommands.mockReturnValue(['npm test']);
  mocks.resolveBaseBranch.mockResolvedValue('main');
  mocks.findStalePullRequests.mockResolvedValue([]);
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

  it('sets updated=true and still proceeds when there are only manual-action notes', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [],
      manualActionNeeded: [
        { ecosystem: 'npm' as const, path: '.', name: null, reason: 'unexplained change' },
      ],
    });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.runCommands).toHaveBeenCalled();
  });

  it('fails and never creates a pull request when a command fails', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
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

  it('commits only the updated directories, pushes, and opens a pull request when every command passes', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({
      results: [{ command: 'npm test', exitCode: 0 }],
      allSucceeded: true,
      failedCommand: null,
    });

    await run(logger);

    expect(mocks.createBranch).toHaveBeenCalledWith('chore/update-deps/non-breaking/2026-07-16');
    expect(mocks.commit).toHaveBeenCalledWith(['.'], expect.any(String));
    expect(mocks.push).toHaveBeenCalledWith('chore/update-deps/non-breaking/2026-07-16');
    expect(mocks.findStalePullRequests).toHaveBeenCalledWith(
      'token',
      'chore/update-deps/non-breaking',
      'chore/update-deps/non-breaking/2026-07-16',
    );
    expect(mocks.createOrUpdatePullRequest).toHaveBeenCalled();
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({
        updated: true,
        commandsPassed: true,
        pullRequestNumber: 42,
        pullRequestTitle: expect.any(String),
        pullRequestBodyPath: '/repo/update-dependencies-pr-body.md',
      }),
    );
    expect(mocks.setFailed).not.toHaveBeenCalled();
  });

  it('writes the pull request title and body without opening one when create-pull-request is false', async () => {
    mocks.readActionInputs.mockReturnValue({
      ...DEFAULT_INPUTS,
      createPullRequest: false,
      githubToken: '',
    });
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.findStalePullRequests).not.toHaveBeenCalled();
    expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
    expect(mocks.createBranch).not.toHaveBeenCalled();
    expect(mocks.writePullRequestBodyToDisk).toHaveBeenCalled();
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({
        updated: true,
        pullRequestTitle: expect.any(String),
        pullRequestBodyPath: '/repo/update-dependencies-pr-body.md',
      }),
    );
    expect(mocks.setFailed).not.toHaveBeenCalled();
  });

  it('fails clearly when create-pull-request is true but github-token is empty', async () => {
    mocks.readActionInputs.mockReturnValue({ ...DEFAULT_INPUTS, githubToken: '' });
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
    expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('github-token'));
  });

  it('skips the release-age gate entirely when min-release-age-days is 0', async () => {
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [],
      changes: [],
      manualActionNeeded: [],
    });

    await run(logger);

    expect(mocks.applyReleaseAgeGate).not.toHaveBeenCalled();
  });

  it('applies the release-age gate and uses its adjusted changes when min-release-age-days is set', async () => {
    mocks.readActionInputs.mockReturnValue({ ...DEFAULT_INPUTS, minReleaseAgeDays: 3 });
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    const gatedChange = { ...CHANGE, toVersion: '1.0.5' };
    mocks.applyReleaseAgeGate.mockResolvedValue({
      changes: [gatedChange],
      ageGateNotes: [{ ecosystem: 'npm' as const, path: '.', name: 'left-pad', reason: 'capped' }],
    });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.applyReleaseAgeGate).toHaveBeenCalledWith(
      [CHANGE],
      expect.objectContaining({ minAgeDays: 3 }),
    );
    expect(mocks.commit).toHaveBeenCalledWith(['.'], expect.any(String));
    expect(mocks.writeSummaryToDisk).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [gatedChange],
        ageGateNotes: [expect.objectContaining({ name: 'left-pad' })],
      }),
      expect.any(String),
    );
  });

  it('runs the stable-version gate before the release-age gate and reports its notes', async () => {
    mocks.readActionInputs.mockReturnValue({ ...DEFAULT_INPUTS, minReleaseAgeDays: 3 });
    const betaChange = { ...CHANGE, toVersion: '2.0.0-beta.1' };
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [betaChange],
      manualActionNeeded: [],
    });
    const note = { ecosystem: 'npm' as const, path: '.', name: 'left-pad', reason: 'beta' };
    mocks.applyStableVersionGate.mockResolvedValue({ changes: [CHANGE], stabilityNotes: [note] });
    mocks.applyReleaseAgeGate.mockResolvedValue({ changes: [CHANGE], ageGateNotes: [] });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.applyStableVersionGate).toHaveBeenCalledWith([betaChange], expect.any(Object));
    expect(mocks.applyReleaseAgeGate).toHaveBeenCalledWith(
      [CHANGE],
      expect.objectContaining({ stableOnly: true }),
    );
    expect(mocks.writeSummaryToDisk).toHaveBeenCalledWith(
      expect.objectContaining({ stabilityNotes: [note] }),
      expect.any(String),
    );
  });

  it('skips the stable-version gate when allowUnstableVersions is set in the config', async () => {
    mocks.loadConfig.mockResolvedValue({
      version: 1,
      ecosystems: {},
      ignorePaths: [],
      allowUnstableVersions: true,
    });
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });

    await run(logger);

    expect(mocks.applyStableVersionGate).not.toHaveBeenCalled();
  });

  it('treats the gate holding every change back as nothing changed, skipping commands and the PR', async () => {
    mocks.readActionInputs.mockReturnValue({ ...DEFAULT_INPUTS, minReleaseAgeDays: 3 });
    mocks.updateRepo.mockResolvedValue({
      manifestsUpdated: [MANIFEST],
      changes: [CHANGE],
      manualActionNeeded: [],
    });
    mocks.applyReleaseAgeGate.mockResolvedValue({
      changes: [],
      ageGateNotes: [
        { ecosystem: 'npm' as const, path: '.', name: 'left-pad', reason: 'held back' },
      ],
    });

    await run(logger);

    // A note with no accompanying change means the file was successfully reverted, so there is
    // nothing to commit; proceeding to `git commit` here would fail outright on a clean tree.
    expect(mocks.runCommands).not.toHaveBeenCalled();
    expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
    expect(mocks.writeSummaryToDisk).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [],
        ageGateNotes: [expect.objectContaining({ name: 'left-pad' })],
      }),
      expect.any(String),
    );
    expect(mocks.setActionOutputs).toHaveBeenCalledWith(
      expect.objectContaining({ updated: false, commandsPassed: true }),
    );
  });

  describe('when the token cannot push workflow files', () => {
    const WORKFLOWS_MANIFEST = {
      ecosystem: 'github-actions' as const,
      language: 'GitHub Actions',
      manifestPath: '.github/workflows/ci.yml',
      directory: '.github/workflows',
    };
    const WORKFLOW_CHANGE = {
      ecosystem: 'github-actions' as const,
      path: '.github/workflows',
      name: 'actions/checkout',
      fromVersion: 'v3',
      toVersion: 'v4',
      breaking: true,
    };
    const REJECTION = new Error(
      'refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission',
    );

    beforeEach(() => {
      mocks.runCommands.mockResolvedValue({ results: [], allSucceeded: true, failedCommand: null });
    });

    it('retries without the workflow files and notes them in the pull request', async () => {
      mocks.updateRepo.mockResolvedValue({
        manifestsUpdated: [MANIFEST, WORKFLOWS_MANIFEST],
        changes: [CHANGE, WORKFLOW_CHANGE],
        manualActionNeeded: [],
      });
      mocks.push.mockRejectedValueOnce(REJECTION).mockResolvedValueOnce(undefined);

      await run(logger);

      expect(mocks.undoLastCommit).toHaveBeenCalledTimes(1);
      expect(mocks.commit).toHaveBeenLastCalledWith(['.'], expect.any(String), [
        '.github/workflows',
      ]);
      const body = mocks.createOrUpdatePullRequest.mock.calls[0]?.[0].body as string;
      expect(body).toContain('Left out of this pull request: actions/checkout v3');
      expect(mocks.setFailed).not.toHaveBeenCalled();
      expect(mocks.setActionOutputs).toHaveBeenCalledWith(
        expect.objectContaining({ pullRequestNumber: 42 }),
      );
    });

    it('fails with a clear message when workflow files were the only updates', async () => {
      mocks.updateRepo.mockResolvedValue({
        manifestsUpdated: [WORKFLOWS_MANIFEST],
        changes: [WORKFLOW_CHANGE],
        manualActionNeeded: [],
      });
      mocks.push.mockRejectedValueOnce(REJECTION);

      await run(logger);

      expect(mocks.createOrUpdatePullRequest).not.toHaveBeenCalled();
      expect(mocks.setFailed).toHaveBeenCalledWith(expect.stringContaining('Workflows'));
    });
  });
});
