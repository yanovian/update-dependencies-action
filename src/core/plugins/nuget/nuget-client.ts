import { fetchJsonWithRetry } from '../../security/http-retry.js';

interface NuGetCatalogEntry {
  readonly version?: string;
  readonly published?: string;
}

interface NuGetLeaf {
  readonly catalogEntry?: NuGetCatalogEntry;
}

interface NuGetPage {
  readonly items?: NuGetLeaf[];
}

interface NuGetRegistrationIndex {
  readonly items?: NuGetPage[];
}

/**
 * The registration index inlines every version's `catalogEntry` for packages with a small
 * enough history; very high-version-count packages split into separate paged documents (a page
 * with only an `"@id"` and no inline `items`), which this skips rather than following, since the
 * gate only needs recent versions and those are the ones already inlined.
 */
export async function fetchNuGetVersionDates(packageId: string): Promise<Map<string, Date> | null> {
  const url = `https://api.nuget.org/v3/registration5-semver1/${encodeURIComponent(packageId.toLowerCase())}/index.json`;
  const index = await fetchJsonWithRetry<NuGetRegistrationIndex>(url);
  if (!index) {
    return null;
  }

  const dates = new Map<string, Date>();
  for (const page of index.items ?? []) {
    for (const leaf of page.items ?? []) {
      const version = leaf.catalogEntry?.version;
      const published = leaf.catalogEntry?.published;
      if (version && published) {
        dates.set(version, new Date(published));
      }
    }
  }
  return dates;
}
