import { fetchJsonWithRetry } from '../../security/http-retry.js';
import { collectVersionDates } from '../../security/version-date-map.js';

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
  return collectVersionDates(
    response.packages?.[packageName] ?? [],
    (entry) => entry.version,
    (entry) => entry.time,
  );
}
