const USER_AGENT =
  'github-actions-update-dependencies (https://github.com/yanovian/github-actions-update-dependencies)';

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
