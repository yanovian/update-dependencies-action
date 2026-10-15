import { z } from 'zod';
import { ALL_ECOSYSTEM_IDS } from '../types/ecosystem-plugin.js';

const ecosystemIdSchema = z.enum(ALL_ECOSYSTEM_IDS);
const updateModeSchema = z.enum(['non-breaking', 'breaking']);

/**
 * Deliberately small: which ecosystems to scan, which directories to skip entirely, per-ecosystem
 * update strategy overrides, and whether unstable versions are allowed. Ignoring
 * one specific package is not supported yet, see _docs/faq-and-limitations.md for why.
 */
export const configSchema = z.object({
  version: z.literal(1).default(1),
  // Anything not listed here is scanned automatically; this is only for disabling one.
  ecosystems: z.partialRecord(ecosystemIdSchema, z.boolean()).default({}),
  // Path prefixes, relative to the repo root, e.g. "examples" or "test-fixtures/broken-repo".
  ignorePaths: z.array(z.string()).default([]),
  // Overrides the `update-strategy` input for one ecosystem. See resolveUpdateMode in
  // update-strategy.ts for the built-in per-ecosystem defaults applied when one isn't listed.
  updateStrategies: z.partialRecord(ecosystemIdSchema, updateModeSchema).default({}),
  // Off by default: an update that resolves to an alpha, beta, rc, snapshot, etc. is walked back
  // to the newest stable version (see src/core/security/version-stability.ts).
  allowUnstableVersions: z.boolean().default(false),
});

export type ResolvedConfig = z.infer<typeof configSchema>;
