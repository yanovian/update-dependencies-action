import { fetchJsonWithRetry } from '../../security/http-retry.js';
import { collectVersionDates } from '../../security/version-date-map.js';

interface RubyGemsVersionEntry {
  readonly number?: string;
  readonly created_at?: string;
}

/** One request returns every published version's creation date. RubyGems has no `pinVersion`
 * (see rubygems-plugin.ts), but the gate still uses this to report how old a flagged version is. */
export async function fetchRubyGemVersionDates(gemName: string): Promise<Map<string, Date> | null> {
  const url = `https://rubygems.org/api/v1/versions/${encodeURIComponent(gemName)}.json`;
  const entries = await fetchJsonWithRetry<RubyGemsVersionEntry[]>(url);
  if (!entries) {
    return null;
  }
  return collectVersionDates(
    entries,
    (entry) => entry.number,
    (entry) => entry.created_at,
  );
}
