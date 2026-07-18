import * as core from '@actions/core';
import type { UpdateMode } from '../core/types/ecosystem-plugin.js';

export interface ActionInputs {
  readonly updateStrategy: UpdateMode;
  readonly checkCommands: string;
  readonly createPullRequest: boolean;
  readonly baseBranch: string;
  readonly branchName: string;
  readonly configPath: string;
  readonly workingDirectory: string;
  readonly githubToken: string;
  readonly minReleaseAgeDays: number;
}

const UPDATE_MODES: readonly UpdateMode[] = ['non-breaking', 'breaking'];

export function readActionInputs(): ActionInputs {
  const updateStrategy = parseEnumInput('update-strategy', UPDATE_MODES, 'non-breaking');

  return {
    updateStrategy,
    checkCommands: core.getInput('check-commands'),
    createPullRequest: core.getBooleanInput('create-pull-request'),
    baseBranch: core.getInput('base-branch'),
    branchName: core.getInput('branch-name') || `chore/update-deps/${updateStrategy}`,
    configPath: core.getInput('config-path') || '.github/update-dependencies.yml',
    workingDirectory: core.getInput('working-directory') || '.',
    githubToken: core.getInput('github-token', { required: true }),
    minReleaseAgeDays: parseMinReleaseAgeDays(core.getInput('min-release-age-days')),
  };
}

function parseMinReleaseAgeDays(rawValue: string): number {
  const value = Number(rawValue || '3');
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Input "min-release-age-days" must be a number of days that is 0 or greater. Got "${rawValue}".`,
    );
  }
  return value;
}

function parseEnumInput<T extends string>(
  name: string,
  allowedValues: readonly T[],
  fallback: T,
): T {
  const rawValue = core.getInput(name) || fallback;
  if (!allowedValues.includes(rawValue as T)) {
    throw new Error(
      `Input "${name}" must be one of: ${allowedValues.join(', ')}. Got "${rawValue}".`,
    );
  }
  return rawValue as T;
}
