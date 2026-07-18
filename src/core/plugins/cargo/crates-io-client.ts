import { fetchJsonWithRetry } from '../../security/http-retry.js';

const USER_AGENT =
  'update-dependencies-action (https://github.com/yanovian/update-dependencies-action)';

interface CratesIoResponse {
  readonly crate?: { readonly max_stable_version?: string };
}

/** crates.io requires a descriptive User-Agent identifying the calling application, or it
 * rejects the request. `max_stable_version` skips pre-releases and yanked versions. */
export async function fetchLatestCrateVersion(name: string): Promise<string | null> {
  const response = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as CratesIoResponse;
  return body.crate?.max_stable_version ?? null;
}

interface CratesIoVersionsResponse {
  readonly versions?: { readonly num?: string; readonly created_at?: string }[];
}

/** One request returns every published version's creation date, used by the release-age gate to
 * find the newest version old enough to satisfy the configured minimum age. */
export async function fetchCrateVersionDates(name: string): Promise<Map<string, Date> | null> {
  const response = await fetchJsonWithRetry<CratesIoVersionsResponse>(
    `https://crates.io/api/v1/crates/${encodeURIComponent(name)}/versions`,
    { headers: { 'User-Agent': USER_AGENT } },
  );
  if (!response) {
    return null;
  }

  const dates = new Map<string, Date>();
  for (const version of response.versions ?? []) {
    if (version.num && version.created_at) {
      dates.set(version.num, new Date(version.created_at));
    }
  }
  return dates;
}
