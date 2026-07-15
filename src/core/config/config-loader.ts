import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { configSchema, type ResolvedConfig } from './config-schema.js';

/**
 * Reads and validates the config from a consuming repo. A missing file is not an error; the
 * Action is fully usable with no config file at all, scanning every ecosystem with no ignored
 * paths.
 */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const fileContents = await readConfigFileIfPresent(configPath);
  if (fileContents === null) {
    return configSchema.parse({});
  }

  const parsedContents = configPath.endsWith('.json')
    ? JSON.parse(fileContents)
    : parseYaml(fileContents);

  return configSchema.parse(parsedContents ?? {});
}

async function readConfigFileIfPresent(configPath: string): Promise<string | null> {
  try {
    return await readFile(configPath, 'utf8');
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
