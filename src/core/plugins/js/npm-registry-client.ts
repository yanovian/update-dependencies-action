import { fetchJsonWithRetry } from '../../security/http-retry.js';

interface NpmPackageDocument {
  readonly time?: Record<string, string>;
}

// registry.npmjs.org's `time` field includes these two non-version bookkeeping keys.
const NON_VERSION_TIME_KEYS = new Set(['created', 'modified']);

/** One request returns every published version's timestamp; shared by npm, yarn, and pnpm since
 * they all resolve against the same registry. */
export async function fetchNpmVersionDates(packageName: string): Promise<Map<string, Date> | null> {
  const url = `https://registry.npmjs.org/${encodeNpmPackageName(packageName)}`;
  const doc = await fetchJsonWithRetry<NpmPackageDocument>(url);
  if (!doc?.time) {
    return null;
  }

  const dates = new Map<string, Date>();
  for (const [version, isoDate] of Object.entries(doc.time)) {
    if (!NON_VERSION_TIME_KEYS.has(version)) {
      dates.set(version, new Date(isoDate));
    }
  }
  return dates;
}

/** Scoped packages ("@scope/name") are a two-segment path on the registry; each segment is
 * percent-encoded on its own so the "/" separator survives, then the leading "@" (which
 * `encodeURIComponent` would otherwise escape to "%40") is restored, matching the literal
 * "@scope/name" form the registry expects. */
function encodeNpmPackageName(name: string): string {
  return name
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    .replace(/^%40/, '@');
}
