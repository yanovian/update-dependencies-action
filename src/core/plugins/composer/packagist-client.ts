import { fetchJsonWithRetry } from '../../security/http-retry.js';

interface PackagistVersionEntry {
  readonly version?: string;
  readonly time?: string;
}

interface PackagistResponse {
  readonly packages?: Record<string, PackagistVersionEntry[]>;
}

/** `packageName` is already "vendor/name", Packagist's own key shape; one request returns every
 * published version's timestamp. */
export async function fetchComposerVersionDates(
  packageName: string,
): Promise<Map<string, Date> | null> {
  const encodedPath = packageName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `https://repo.packagist.org/p2/${encodedPath}.json`;
  const response = await fetchJsonWithRetry<PackagistResponse>(url);
  if (!response) {
    return null;
  }

  const entries = response.packages?.[packageName] ?? [];
  const dates = new Map<string, Date>();
  for (const entry of entries) {
    if (entry.version && entry.time) {
      dates.set(entry.version, new Date(entry.time));
    }
  }
  return dates;
}
