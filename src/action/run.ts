import path from 'node:path';
import * as core from '@actions/core';
import { parseCommands, runCommands } from '../core/commands/command-runner.js';
import { loadConfig } from '../core/config/config-loader.js';
import type { ResolvedConfig } from '../core/config/config-schema.js';
import { listRepoFiles } from '../core/discovery/list-repo-files.js';
import { setGitHubApiToken } from '../core/github/github-api.js';
import type { Logger } from '../core/logging/logger.js';
import { createAllPlugins } from '../core/plugins/all-plugins.js';
import { createPluginRegistry, type PluginRegistry } from '../core/plugins/registry.js';
import { writeSummaryToDisk } from '../core/reporting/report-builder.js';
import { updateRepo, type UpdateRepoResult } from '../core/update/update-repo.js';
import { gateChanges, type GateNotes } from './gate-changes.js';
import type { ActionInputs } from './inputs.js';
import { readActionInputs } from './inputs.js';
import { setActionOutputs } from './outputs.js';
import { publishPullRequest, summaryOutputDir } from './publish-pull-request.js';

function createFullRegistry(): PluginRegistry {
  const registry = createPluginRegistry();
  for (const plugin of createAllPlugins()) {
    registry.register(plugin);
  }
  return registry;
}

export interface RunContext {
  readonly inputs: ActionInputs;
  readonly config: ResolvedConfig;
  readonly repoRoot: string;
  readonly logger: Logger;
}

export async function run(logger: Logger): Promise<void> {
  const inputs = readActionInputs();
  setGitHubApiToken(inputs.githubToken);
  const repoRoot = path.join(
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
    inputs.workingDirectory,
  );
  const config = await loadConfig(path.join(repoRoot, inputs.configPath));
  const ctx: RunContext = { inputs, config, repoRoot, logger };

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

  const { changes, notes } = await gateChanges(ctx, updateResult, registry);
  const manualActionNeeded = updateResult.manualActionNeeded;

  // Deliberately ignores the gate notes here: every note that leaves a real, uncommitted disk
  // change behind keeps that change in `changes` too (see release-age-gate.ts), so a note with
  // no accompanying change means the file is genuinely unchanged, nothing to commit. Requiring
  // the notes to also be empty would send `git commit` down a path that fails outright when
  // there is nothing staged.
  if (changes.length === 0 && manualActionNeeded.length === 0) {
    logger.info('No dependency updates found.');
    for (const note of notes.stabilityNotes) {
      logger.info(`Stable-version policy — ${note.name ?? note.path}: ${note.reason}`);
    }
    for (const note of notes.ageGateNotes) {
      logger.info(`Release-age policy — ${note.name ?? note.path}: ${note.reason}`);
    }
    const summaryPath = await writeSummaryToDisk(
      {
        mode: inputs.updateStrategy,
        changes: [],
        manualActionNeeded: [],
        ...notes,
        commands: [],
      },
      summaryOutputDir(),
    );
    setActionOutputs({ updated: false, changesSummaryPath: summaryPath, commandsPassed: true });
    return;
  }

  const pathCount = new Set(changes.map((change) => change.path)).size;
  logger.info(`Found ${changes.length} package update(s) across ${pathCount} path(s).`);

  await verifyAndPublish(ctx, { ...updateResult, changes }, notes);
}

async function verifyAndPublish(
  ctx: RunContext,
  updateResult: UpdateRepoResult,
  notes: GateNotes,
): Promise<void> {
  const { inputs, repoRoot, logger } = ctx;
  const commandSummary = await runCommands(parseCommands(inputs.checkCommands), repoRoot, logger);
  const summaryPath = await writeSummaryToDisk(
    {
      mode: inputs.updateStrategy,
      changes: updateResult.changes,
      manualActionNeeded: updateResult.manualActionNeeded,
      ...notes,
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
    notes,
    commandResults: commandSummary.results,
    summaryPath,
  });
}
