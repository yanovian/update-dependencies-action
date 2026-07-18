import { fetchJsonWithRetry, fetchWithRetry } from '../../security/http-retry.js';

interface GoVersionInfo {
  readonly Version?: string;
  readonly Time?: string;
}

// The proxy's @v/list has no dates and can be long-lived modules' entire release history; only
// the newest ones matter to the release-age gate (it wants the newest version old enough, never
// the oldest), and each date needs its own request, so the candidate set fetched is bounded.
const MAX_VERSIONS_TO_CHECK = 25;
const INFO_FETCH_CONCURRENCY = 5;

/** Go's module proxy protocol (`golang.org/ref/mod#goproxy-protocol`) escapes uppercase letters
 * in module paths as "!" followed by the lowercase letter, so mixed-case import paths map to a
 * distinct, unambiguous URL. */
function escapeModulePath(module: string): string {
  return module.replace(/[A-Z]/g, (letter) => `!${letter.toLowerCase()}`);
}

async function fetchVersionList(escapedModule: string): Promise<string[] | null> {
  const response = await fetchWithRetry(`https://proxy.golang.org/${escapedModule}/@v/list`);
  if (!response || !response.ok) {
    return null;
  }
  const text = await response.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function fetchGoModuleVersionDates(module: string): Promise<Map<string, Date> | null> {
  const escapedModule = escapeModulePath(module);
  const versions = await fetchVersionList(escapedModule);
  if (versions === null) {
    return null;
  }

  const candidates = [...versions].sort(compareSemverDescending).slice(0, MAX_VERSIONS_TO_CHECK);
  const dates = new Map<string, Date>();

  for (let i = 0; i < candidates.length; i += INFO_FETCH_CONCURRENCY) {
    const batch = candidates.slice(i, i + INFO_FETCH_CONCURRENCY);
    const infos = await Promise.all(
      batch.map((version) =>
        fetchJsonWithRetry<GoVersionInfo>(
          `https://proxy.golang.org/${escapedModule}/@v/${encodeURIComponent(version)}.info`,
        ),
      ),
    );
    batch.forEach((version, index) => {
      const time = infos[index]?.Time;
      if (time) {
        dates.set(version, new Date(time));
      }
    });
  }

  return dates;
}

function compareSemverDescending(a: string, b: string): number {
  return compareSemverAscending(b, a);
}

function compareSemverAscending(a: string, b: string): number {
  const [aCore, aPre] = splitPrerelease(a);
  const [bCore, bPre] = splitPrerelease(b);
  const coreDiff = compareCoreParts(coreParts(aCore), coreParts(bCore));
  return coreDiff !== 0 ? coreDiff : comparePrerelease(aPre, bPre);
}

function compareCoreParts(aParts: readonly number[], bParts: readonly number[]): number {
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** A version with a pre-release tag ("-beta", "-rc1", ...) sorts before its plain release. */
function comparePrerelease(aPre: string | null, bPre: string | null): number {
  if (aPre === null && bPre === null) {
    return 0;
  }
  if (aPre === null) {
    return 1;
  }
  return bPre === null ? -1 : aPre.localeCompare(bPre);
}

function splitPrerelease(version: string): [string, string | null] {
  const stripped = version.replace(/^v/, '');
  const [core, ...rest] = stripped.split('-');
  return [core ?? stripped, rest.length > 0 ? rest.join('-') : null];
}

function coreParts(core: string): number[] {
  return core.split('.').map((part) => Number(part) || 0);
}
