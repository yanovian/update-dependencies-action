import type { EcosystemId, UpdateMode } from '../types/ecosystem-plugin.js';
import type { ResolvedConfig } from './config-schema.js';

/**
 * Ecosystems whose default ignores the `update-strategy` input. A GitHub Action's floating major
 * tag (`actions/checkout@v4`) never moves past its major on its own, so a non-breaking run would
 * leave every workflow on an old major forever; staying current there is the common expectation,
 * and a workflow-file bump is easy to review and revert.
 */
const ECOSYSTEM_DEFAULT_STRATEGIES: Partial<Record<EcosystemId, UpdateMode>> = {
  'github-actions': 'breaking',
};

/** The config file's `updateStrategies` wins, then the ecosystem's own default, then the
 * run-wide `update-strategy` input. */
export function resolveUpdateMode(
  ecosystem: EcosystemId,
  runMode: UpdateMode,
  config: ResolvedConfig,
): UpdateMode {
  return config.updateStrategies[ecosystem] ?? ECOSYSTEM_DEFAULT_STRATEGIES[ecosystem] ?? runMode;
}
