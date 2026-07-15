import * as core from '@actions/core';
import { run } from './action/run.js';
import { createActionsLogger } from './core/logging/logger.js';

run(createActionsLogger()).catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
