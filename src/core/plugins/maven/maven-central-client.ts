import { fetchJsonWithRetry } from '../../security/http-retry.js';
import { collectVersionDates } from '../../security/version-date-map.js';

interface MavenSearchDoc {
  readonly v?: string;
  readonly timestamp?: number;
}

interface MavenSearchResponse {
  readonly response?: { readonly docs?: MavenSearchDoc[] };
}

/** Shared by Maven and Gradle, since both resolve against Maven Central and both identify a
 * dependency as "groupId:artifactId" already. `rows=200` covers recent history, which is all the
 * release-age gate needs (it is looking for the newest version old enough, not the oldest). */
export async function fetchMavenVersionDates(
  groupArtifact: string,
): Promise<Map<string, Date> | null> {
  const [groupId, artifactId] = groupArtifact.split(':');
  if (!groupId || !artifactId) {
    return null;
  }

  const query = `g:"${groupId}" AND a:"${artifactId}"`;
  const url = `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&core=gav&rows=200&wt=json`;
  const response = await fetchJsonWithRetry<MavenSearchResponse>(url);
  if (!response) {
    return null;
  }
  return collectVersionDates(
    response.response?.docs ?? [],
    (doc) => doc.v,
    (doc) => doc.timestamp,
  );
}
