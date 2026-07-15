import { z } from 'zod';
import { ALL_ECOSYSTEM_IDS } from '../types/ecosystem-plugin.js';

const ecosystemIdSchema = z.enum(ALL_ECOSYSTEM_IDS);

/**
 * Deliberately small: which ecosystems to scan and which directories to skip entirely. Ignoring
 * one specific package is not supported yet, see _docs/faq-and-limitations.md for why.
 */
export const configSchema = z.object({
  version: z.literal(1).default(1),
  // Anything not listed here is scanned automatically; this is only for disabling one.
  ecosystems: z.partialRecord(ecosystemIdSchema, z.boolean()).default({}),
  // Path prefixes, relative to the repo root, e.g. "examples" or "test-fixtures/broken-repo".
  ignorePaths: z.array(z.string()).default([]),
});

export type ResolvedConfig = z.infer<typeof configSchema>;
