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
}

const UPDATE_MODES: readonly UpdateMode[] = ['non-breaking', 'breaking'];

export function readActionInputs(): ActionInputs {
  const updateStrategy = parseEnumInput('update-strategy', UPDATE_MODES, 'non-breaking');

  return {
    updateStrategy,
    checkCommands: core.getInput('check-commands'),
    createPullRequest: core.getBooleanInput('create-pull-request'),
    baseBranch: core.getInput('base-branch'),
    branchName: core.getInput('branch-name') || `update-dependencies/${updateStrategy}`,
    configPath: core.getInput('config-path') || '.github/update-dependencies.yml',
    workingDirectory: core.getInput('working-directory') || '.',
    githubToken: core.getInput('github-token', { required: true }),
  };
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
