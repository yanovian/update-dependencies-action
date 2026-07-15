import { runProcess } from '../../commands/run-process.js';
import { normalizePipName } from './pip-manifest.js';

interface PipOutdatedEntry {
  readonly name: string;
  readonly latest_version: string;
}

/** `pip list --outdated` compares whatever is actually installed against PyPI, so the caller
 * must have already run `pip install -r requirements.txt` in the same environment. */
export async function findOutdatedPackages(cwd: string): Promise<Map<string, string>> {
  const result = await runProcess('pip list --outdated --format=json', { cwd });
  const entries = JSON.parse(result.stdout) as PipOutdatedEntry[];

  const outdated = new Map<string, string>();
  for (const entry of entries) {
    outdated.set(normalizePipName(entry.name), entry.latest_version);
  }
  return outdated;
}
