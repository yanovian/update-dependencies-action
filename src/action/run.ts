import { tmpdir } from 'node:os';
import path from 'node:path';
import * as core from '@actions/core';
import { parseCommands, runCommands, type CommandResult } from '../core/commands/command-runner.js';
import { loadConfig } from '../core/config/config-loader.js';
import { listRepoFiles } from '../core/discovery/list-repo-files.js';
import { createGitClient } from '../core/git/git-client.js';
import { resolveBaseBranch } from '../core/github/base-branch.js';
import {
  createOrUpdatePullRequest,
  findStalePullRequests,
  type PullRequestResult,
} from '../core/github/pr-manager.js';
import type { Logger } from '../core/logging/logger.js';
import { createAllPlugins } from '../core/plugins/all-plugins.js';
import { createPluginRegistry, type PluginRegistry } from '../core/plugins/registry.js';
import { buildPullRequestBody, buildPullRequestTitle } from '../core/reporting/pr-body-builder.js';
import {
  writePullRequestBodyToDisk,
  writeSummaryToDisk,
} from '../core/reporting/report-builder.js';
import { applyReleaseAgeGate } from '../core/security/release-age-gate.js';
import type { ManualNote, PackageChange } from '../core/types/ecosystem-plugin.js';
import { updateRepo, type UpdateRepoResult } from '../core/update/update-repo.js';
import { getUtcDateString } from '../core/util/current-date.js';
import type { ActionInputs } from './inputs.js';
import { readActionInputs } from './inputs.js';
import { setActionOutputs } from './outputs.js';

function createFullRegistry(): PluginRegistry {
  const registry = createPluginRegistry();
  for (const plugin of createAllPlugins()) {
    registry.register(plugin);
  }
  return registry;
}

/** GitHub Actions sets RUNNER_TEMP to a directory outside any checkout; falling back to the
 * OS temp dir covers running this outside a GitHub-hosted runner. Never the repo itself: this
 * file must never end up inside the working tree this Action commits from. */
function summaryOutputDir(): string {
  return process.env.RUNNER_TEMP ?? tmpdir();
}

interface RunContext {
  readonly inputs: ActionInputs;
  readonly repoRoot: string;
  readonly logger: Logger;
}

export async function run(logger: Logger): Promise<void> {
  const inputs = readActionInputs();
  const repoRoot = path.join(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    inputs.workingDirectory,
  );
  const ctx: RunContext = { inputs, repoRoot, logger };
  const config = await loadConfig(path.join(repoRoot, inputs.configPath));

  logger.info('Scanning repository for package managers');
  const repoFiles = await listRepoFiles(repoRoot);
  const registry = createFullRegistry();
  const updateResult = await updateRepo(repoFiles, {
    repoRoot,
    registry,
    mode: inputs.updateStrategy,
    config,
    logger,
  });

  const ageGate = await gateChanges(ctx, updateResult, registry);
  const changes = ageGate.changes;
  const manualActionNeeded = updateResult.manualActionNeeded;

  // Deliberately ignores ageGateNotes here: every note that leaves a real, uncommitted disk
  // change behind keeps that change in `changes` too (see release-age-gate.ts), so a note with
  // no accompanying change means the file is genuinely unchanged, nothing to commit. Requiring
  // ageGateNotes to also be empty would send `git commit` down a path that fails outright when
  // there is nothing staged.
  if (changes.length === 0 && manualActionNeeded.length === 0) {
    logger.info('No dependency updates found.');
    for (const note of ageGate.ageGateNotes) {
      logger.info(`Release-age policy — ${note.name ?? note.path}: ${note.reason}`);
    }
    const summaryPath = await writeSummaryToDisk(
      {
        mode: inputs.updateStrategy,
        changes: [],
        manualActionNeeded: [],
        ageGateNotes: ageGate.ageGateNotes,
        commands: [],
      },
      summaryOutputDir(),
    );
    setActionOutputs({ updated: false, changesSummaryPath: summaryPath, commandsPassed: true });
    return;
  }

  const pathCount = new Set(changes.map((change) => change.path)).size;
  logger.info(`Found ${changes.length} package update(s) across ${pathCount} path(s).`);

  await verifyAndPublish(ctx, { ...updateResult, changes }, ageGate.ageGateNotes);
}

/** Skipped entirely (no network calls) when the policy is disabled, rather than calling the gate
 * with a threshold of zero days, which would still spend a registry round trip per package only
 * to confirm every version already clears it. */
async function gateChanges(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  registry: PluginRegistry,
): Promise<{ changes: PackageChange[]; ageGateNotes: ManualNote[] }> {
  const { inputs, repoRoot, logger } = ctx;
  if (inputs.minReleaseAgeDays <= 0) {
    return { changes: updateResult.changes, ageGateNotes: [] };
  }
  logger.info(`Applying the ${inputs.minReleaseAgeDays}-day minimum release age policy`);
  return applyReleaseAgeGate(updateResult.changes, {
    minAgeDays: inputs.minReleaseAgeDays,
    manifestsUpdated: updateResult.manifestsUpdated,
    pluginRegistry: registry,
    repoRoot,
    logger,
  });
}

async function verifyAndPublish(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  ageGateNotes: readonly ManualNote[],
): Promise<void> {
  const { inputs, repoRoot, logger } = ctx;
  const commandSummary = await runCommands(parseCommands(inputs.checkCommands), repoRoot, logger);
  const summaryPath = await writeSummaryToDisk(
    {
      mode: inputs.updateStrategy,
      changes: updateResult.changes,
      manualActionNeeded: updateResult.manualActionNeeded,
      ageGateNotes,
      commands: commandSummary.results,
    },
    summaryOutputDir(),
  );

  if (!commandSummary.allSucceeded) {
    setActionOutputs({ updated: true, changesSummaryPath: summaryPath, commandsPassed: false });
    core.setFailed(
      `Command failed, so no pull request was created: ${commandSummary.failedCommand}`,
    );
    return;
  }

  await publishPullRequest(ctx, updateResult, {
    ageGateNotes,
    commandResults: commandSummary.results,
    summaryPath,
  });
}

interface PublishInput {
  readonly ageGateNotes: readonly ManualNote[];
  readonly commandResults: readonly CommandResult[];
  readonly summaryPath: string;
}

/** Builds the pull request title and body once, whether or not this Action opens the pull
 * request itself: a workflow that withholds the token (create-pull-request: false) can still
 * open the pull request in a later step, using its own trusted action, with this same content. */
async function publishPullRequest(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  input: PublishInput,
): Promise<void> {
  const { inputs, logger } = ctx;
  const { ageGateNotes, commandResults, summaryPath } = input;
  const content = await buildPullRequestContent(ctx, updateResult, ageGateNotes, commandResults);
  const bodyPath = await writePullRequestBodyToDisk(content.body, summaryOutputDir());
  const baseOutputs = {
    updated: true,
    changesSummaryPath: summaryPath,
    commandsPassed: true,
    pullRequestTitle: content.title,
    pullRequestBodyPath: bodyPath,
  };

  if (!inputs.createPullRequest) {
    logger.info('create-pull-request is false; leaving the updated files in the working tree.');
    setActionOutputs(baseOutputs);
    return;
  }
  if (!inputs.githubToken) {
    core.setFailed(
      'create-pull-request is true but github-token is empty; provide a token, or set ' +
        'create-pull-request to false and open the pull request yourself from pull-request-body-path.',
    );
    return;
  }

  const pr = await openPullRequest(ctx, updateResult, content);
  setActionOutputs({ ...baseOutputs, pullRequestNumber: pr.number, pullRequestUrl: pr.url });
}

interface PullRequestContent {
  readonly branchName: string;
  readonly title: string;
  readonly body: string;
}

/** The "stale pull requests" section needs a real, token-authenticated API call to look up other
 * open pull requests, so it's simply left out when there is no token, rather than the whole body
 * failing to generate. Everything else in the body is derived from this run's own data. */
async function buildPullRequestContent(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  ageGateNotes: readonly ManualNote[],
  commandResults: readonly CommandResult[],
): Promise<PullRequestContent> {
  const { inputs } = ctx;
  const runDate = getUtcDateString();
  const branchName = `${inputs.branchName}/${runDate}`;
  const stalePullRequests = inputs.githubToken
    ? await findStalePullRequests(inputs.githubToken, inputs.branchName, branchName)
    : [];

  return {
    branchName,
    title: buildPullRequestTitle(updateResult.changes, inputs.updateStrategy, runDate),
    body: buildPullRequestBody({
      mode: inputs.updateStrategy,
      changes: updateResult.changes,
      manualActionNeeded: updateResult.manualActionNeeded,
      ageGateNotes,
      minReleaseAgeDays: inputs.minReleaseAgeDays,
      commandResults,
      runDate,
      stalePullRequests,
    }),
  };
}

/** Re-running this on the same day force-pushes the same dated branch and reuses the existing
 * pull request instead of opening a new one; a run on a later date opens a new one, so dated
 * branches keep a record of what changed and when. */
async function openPullRequest(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  content: PullRequestContent,
): Promise<PullRequestResult> {
  const { inputs, repoRoot } = ctx;
  const { branchName, title, body } = content;
  const baseBranch = await resolveBaseBranch(inputs.githubToken, inputs.baseBranch);
  const git = createGitClient(repoRoot);
  const changedDirectories = [
    ...new Set(
      updateResult.manifestsUpdated.flatMap((m) => [
        m.directory,
        m.lockfileDirectory ?? m.directory,
      ]),
    ),
  ];

  await git.createBranch(branchName);
  await git.commit(changedDirectories, title);
  await git.push(branchName);

  return createOrUpdatePullRequest({
    githubToken: inputs.githubToken,
    baseBranch,
    branchName,
    title,
    body,
  });
}
