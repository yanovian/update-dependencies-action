import { runProcess } from '../../commands/run-process.js';

export interface OutdatedComposerPackage {
  readonly name: string;
  readonly current: string;
  readonly latest: string;
}

interface RawOutdatedEntry {
  readonly name?: string;
  readonly version?: string;
  readonly latest?: string;
}

interface ComposerOutdatedShape {
  readonly installed?: RawOutdatedEntry[];
}

export async function fetchOutdatedComposerPackages(
  dir: string,
): Promise<Map<string, OutdatedComposerPackage>> {
  const result = await runProcess('composer outdated --direct --format=json', { cwd: dir });
  const parsed = JSON.parse(result.stdout) as ComposerOutdatedShape;

  const outdated = new Map<string, OutdatedComposerPackage>();
  for (const entry of parsed.installed ?? []) {
    if (entry.name && entry.version && entry.latest && entry.version !== entry.latest) {
      outdated.set(entry.name, { name: entry.name, current: entry.version, latest: entry.latest });
    }
  }
  return outdated;
}
