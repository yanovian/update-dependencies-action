import * as core from '@actions/core';

export interface RunOutputs {
  readonly updated: boolean;
  readonly pullRequestNumber?: number;
  readonly pullRequestUrl?: string;
  readonly pullRequestTitle?: string;
  readonly pullRequestBodyPath?: string;
  readonly changesSummaryPath: string;
  readonly commandsPassed: boolean;
}

export function setActionOutputs(outputs: RunOutputs): void {
  core.setOutput('updated', outputs.updated);
  core.setOutput('pull-request-number', outputs.pullRequestNumber ?? '');
  core.setOutput('pull-request-url', outputs.pullRequestUrl ?? '');
  core.setOutput('pull-request-title', outputs.pullRequestTitle ?? '');
  core.setOutput('pull-request-body-path', outputs.pullRequestBodyPath ?? '');
  core.setOutput('changes-summary-path', outputs.changesSummaryPath);
  core.setOutput('commands-passed', outputs.commandsPassed);
}
