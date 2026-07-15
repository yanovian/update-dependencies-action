import path from 'node:path';
import * as core from '@actions/core';
import { parseCommands, runCommands, type CommandResult } from '../core/commands/command-runner.js';
import { loadConfig } from '../core/config/config-loader.js';
import { listRepoFiles } from '../core/discovery/list-repo-files.js';
import { createGitClient } from '../core/git/git-client.js';
import { resolveBaseBranch } from '../core/github/base-branch.js';
import { createOrUpdatePullRequest, type PullRequestResult } from '../core/github/pr-manager.js';
import type { Logger } from '../core/logging/logger.js';
import { createAllPlugins } from '../core/plugins/all-plugins.js';
import { createPluginRegistry, type PluginRegistry } from '../core/plugins/registry.js';
import { buildPullRequestBody, buildPullRequestTitle } from '../core/reporting/pr-body-builder.js';
import { writeSummaryToDisk } from '../core/reporting/report-builder.js';
import type { PackageChange } from '../core/types/ecosystem-plugin.js';
import { updateRepo, type UpdateRepoResult } from '../core/update/update-repo.js';
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

export async function run(logger: Logger): Promise<void> {
  const inputs = readActionInputs();
  const repoRoot = path.join(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    inputs.workingDirectory,
  );
  const config = await loadConfig(path.join(repoRoot, inputs.configPath));

  logger.info('Scanning repository for package managers');
  const repoFiles = await listRepoFiles(repoRoot);
  const updateResult = await updateRepo(repoFiles, {
    repoRoot,
    registry: createFullRegistry(),
    mode: inputs.updateStrategy,
    config,
    logger,
  });

  if (updateResult.changes.length === 0) {
    logger.info('No dependency updates found.');
    const summaryPath = await writeSummaryToDisk(
      {
        mode: inputs.updateStrategy,
        changes: [],
        manualActionNeeded: updateResult.manualActionNeeded,
        commands: [],
      },
      repoRoot,
    );
    setActionOutputs({ updated: false, changesSummaryPath: summaryPath, commandsPassed: true });
    return;
  }

  const pathCount = new Set(updateResult.changes.map((change) => change.path)).size;
  logger.info(
    `Found ${updateResult.changes.length} package update(s) across ${pathCount} path(s).`,
  );

  await verifyAndPublish(inputs, updateResult, repoRoot, logger);
}

async function verifyAndPublish(
  inputs: ActionInputs,
  updateResult: UpdateRepoResult,
  repoRoot: string,
  logger: Logger,
): Promise<void> {
  const commandSummary = await runCommands(parseCommands(inputs.commands), repoRoot, logger);
  const summaryPath = await writeSummaryToDisk(
    {
      mode: inputs.updateStrategy,
      changes: updateResult.changes,
      manualActionNeeded: updateResult.manualActionNeeded,
      commands: commandSummary.results,
    },
    repoRoot,
  );

  if (!commandSummary.allSucceeded) {
    setActionOutputs({ updated: true, changesSummaryPath: summaryPath, commandsPassed: false });
    core.setFailed(
      `Command failed, so no pull request was created: ${commandSummary.failedCommand}`,
    );
    return;
  }

  if (!inputs.createPullRequest) {
    logger.info('create-pull-request is false; leaving the updated files in the working tree.');
    setActionOutputs({ updated: true, changesSummaryPath: summaryPath, commandsPassed: true });
    return;
  }

  const pr = await openPullRequest(inputs, updateResult, commandSummary.results, repoRoot);
  setActionOutputs({
    updated: true,
    pullRequestNumber: pr.number,
    pullRequestUrl: pr.url,
    changesSummaryPath: summaryPath,
    commandsPassed: true,
  });
}

async function openPullRequest(
  inputs: ActionInputs,
  updateResult: UpdateRepoResult,
  commandResults: readonly CommandResult[],
  repoRoot: string,
): Promise<PullRequestResult> {
  const baseBranch = await resolveBaseBranch(inputs.githubToken, inputs.baseBranch);
  const git = createGitClient(repoRoot);

  await git.createBranch(inputs.branchName);
  await git.commitAll(buildCommitMessage(updateResult.changes, inputs));
  await git.push(inputs.branchName);

  return createOrUpdatePullRequest({
    githubToken: inputs.githubToken,
    baseBranch,
    branchName: inputs.branchName,
    title: buildPullRequestTitle(updateResult.changes, inputs.updateStrategy),
    body: buildPullRequestBody({
      mode: inputs.updateStrategy,
      changes: updateResult.changes,
      manualActionNeeded: updateResult.manualActionNeeded,
      commandResults,
    }),
  });
}

function buildCommitMessage(changes: readonly PackageChange[], inputs: ActionInputs): string {
  return buildPullRequestTitle(changes, inputs.updateStrategy);
}
