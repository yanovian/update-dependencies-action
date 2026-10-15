import { tmpdir } from 'node:os';
import * as core from '@actions/core';
import type { CommandResult } from '../core/commands/command-runner.js';
import { createGitClient } from '../core/git/git-client.js';
import { resolveBaseBranch } from '../core/github/base-branch.js';
import {
  createOrUpdatePullRequest,
  findStalePullRequests,
  type PullRequestResult,
} from '../core/github/pr-manager.js';
import { buildPullRequestBody, buildPullRequestTitle } from '../core/reporting/pr-body-builder.js';
import { writePullRequestBodyToDisk } from '../core/reporting/report-builder.js';
import type { UpdateRepoResult } from '../core/update/update-repo.js';
import { getUtcDateString } from '../core/util/current-date.js';
import type { GateNotes } from './gate-changes.js';
import { setActionOutputs } from './outputs.js';
import type { RunContext } from './run.js';
import {
  isWorkflowPermissionRejection,
  WORKFLOWS_DIR,
  WorkflowPermissionError,
  withoutWorkflowFileUpdates,
} from './workflow-permission.js';

/** GitHub Actions sets RUNNER_TEMP to a directory outside any checkout; falling back to the
 * OS temp dir covers running this outside a GitHub-hosted runner. Never the repo itself: this
 * file must never end up inside the working tree this Action commits from. */
export function summaryOutputDir(): string {
  return process.env.RUNNER_TEMP ?? tmpdir();
}

export interface PublishInput {
  readonly notes: GateNotes;
  readonly commandResults: readonly CommandResult[];
  readonly summaryPath: string;
}

/** Builds the pull request title and body once, whether or not this Action opens the pull
 * request itself: a workflow that withholds the token (create-pull-request: false) can still
 * open the pull request in a later step, using its own trusted action, with this same content. */
export async function publishPullRequest(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  input: PublishInput,
): Promise<void> {
  const { inputs, logger } = ctx;
  const { notes, commandResults, summaryPath } = input;
  const content = await buildPullRequestContent(ctx, updateResult, notes, commandResults);
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

  try {
    const pr = await openPullRequest(ctx, updateResult, content);
    setActionOutputs({ ...baseOutputs, pullRequestNumber: pr.number, pullRequestUrl: pr.url });
  } catch (error) {
    if (!(error instanceof WorkflowPermissionError)) {
      throw error;
    }
    await publishWithoutWorkflowFiles(ctx, updateResult, input);
  }
}

/** See workflow-permission.ts: the same pull request, minus the workflow file updates the token
 * wasn't allowed to push, with a note in the body saying which ones and how to include them. */
async function publishWithoutWorkflowFiles(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  input: PublishInput,
): Promise<void> {
  const reduced = withoutWorkflowFileUpdates(updateResult, input.notes);
  if (!reduced.hasOtherUpdates) {
    core.setFailed(
      `The only updates found were to workflow files in ${WORKFLOWS_DIR}, and github-token is not ` +
        'allowed to push those. Use a PAT with the Workflows: Read and write permission, or set ' +
        '`ecosystems.github-actions: false` in the config file.',
    );
    return;
  }
  ctx.logger.warn(
    `github-token is not allowed to update ${WORKFLOWS_DIR}; opening the pull request without those files.`,
  );
  const content = await buildPullRequestContent(
    ctx,
    reduced.updateResult,
    reduced.notes,
    input.commandResults,
  );
  const bodyPath = await writePullRequestBodyToDisk(content.body, summaryOutputDir());
  const pr = await openPullRequest(ctx, reduced.updateResult, content, [WORKFLOWS_DIR]);
  setActionOutputs({
    updated: true,
    changesSummaryPath: input.summaryPath,
    commandsPassed: true,
    pullRequestTitle: content.title,
    pullRequestBodyPath: bodyPath,
    pullRequestNumber: pr.number,
    pullRequestUrl: pr.url,
  });
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
  notes: GateNotes,
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
      ...notes,
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
  excludePaths: readonly string[] = [],
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
  await (excludePaths.length > 0
    ? git.commit(changedDirectories, title, excludePaths)
    : git.commit(changedDirectories, title));
  try {
    await git.push(branchName);
  } catch (error) {
    if (!isWorkflowPermissionRejection(error) || excludePaths.length > 0) {
      throw error;
    }
    await git.undoLastCommit();
    throw new WorkflowPermissionError();
  }

  return createOrUpdatePullRequest({
    githubToken: inputs.githubToken,
    baseBranch,
    branchName,
    title,
    body,
  });
}
