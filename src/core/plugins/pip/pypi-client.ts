import { fetchJsonWithRetry } from '../../security/http-retry.js';

interface PypiReleaseFile {
  readonly upload_time_iso_8601?: string;
}

interface PypiResponse {
  readonly releases?: Record<string, PypiReleaseFile[]>;
}

/** One request returns every release's files; a version can have multiple files (wheel, sdist,
 * ...), each with its own upload time, so the earliest is the version's real publish date. */
export async function fetchPypiVersionDates(
  packageName: string,
): Promise<Map<string, Date> | null> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;
  const response = await fetchJsonWithRetry<PypiResponse>(url);
  if (!response?.releases) {
    return null;
  }

  const dates = new Map<string, Date>();
  for (const [version, files] of Object.entries(response.releases)) {
    const earliest = files
      .map((file) => file.upload_time_iso_8601)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (earliest) {
      dates.set(version, new Date(earliest));
    }
  }
  return dates;
}
