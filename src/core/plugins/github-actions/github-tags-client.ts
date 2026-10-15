import { gitHubApiGet, type GitHubApiPage } from '../../github/github-api.js';
import { parseTagVersion } from './action-tags.js';

// 100 per page is the API maximum; 10 pages covers even repos with a long tag history
// (github/codeql-action) while bounding how much of the rate limit one action can use.
const MAX_TAG_PAGES = 10;

interface GitHubTag {
  readonly name?: string;
  readonly commit?: { readonly sha?: string };
}

/**
 * Every tag of `repo` ("owner/name") mapped to the commit it points to. The tags endpoint
 * already resolves annotated tags to their commit, which is what a SHA-pinned `uses:` needs.
 * Null when the repo can't be read at all (private, renamed, rate limited, network error) so the
 * caller can report it; a later page failing keeps whatever was already read.
 */
export async function listActionTags(repo: string): Promise<Map<string, string> | null> {
  const tags = new Map<string, string>();
  let next: string | null = `/repos/${repo}/tags?per_page=100`;

  for (let page = 0; next && page < MAX_TAG_PAGES; page++) {
    const result: GitHubApiPage<GitHubTag[]> | null = await gitHubApiGet<GitHubTag[]>(next);
    if (!result || !Array.isArray(result.data)) {
      return page === 0 ? null : tags;
    }
    for (const tag of result.data) {
      if (tag.name && tag.commit?.sha) {
        tags.set(tag.name, tag.commit.sha);
      }
    }
    next = result.nextUrl;
  }
  return tags;
}

interface GitHubRelease {
  readonly tag_name?: string;
  readonly published_at?: string | null;
  readonly draft?: boolean;
}

/**
 * Release dates for the release-age gate, from the repo's GitHub Releases (the 100 newest,
 * plenty since the gate only ever wants the newest versions). A floating tag like `v4` or `v4.1`
 * has no release of its own but points at the newest release under it, so it's given that
 * release's date: that's the code a workflow on `@v4` actually runs.
 */
export async function fetchGitHubActionVersionDates(
  repo: string,
): Promise<Map<string, Date> | null> {
  const result = await gitHubApiGet<GitHubRelease[]>(`/repos/${repo}/releases?per_page=100`);
  if (!result || !Array.isArray(result.data)) {
    return null;
  }

  const dates = new Map<string, Date>();
  for (const release of result.data) {
    if (!release.draft && release.tag_name && release.published_at) {
      dates.set(release.tag_name, new Date(release.published_at));
    }
  }
  return withFloatingTagDates(dates);
}

function withFloatingTagDates(dates: Map<string, Date>): Map<string, Date> {
  const result = new Map(dates);
  for (const [tag, date] of dates) {
    const version = parseTagVersion(tag);
    if (!version) {
      continue;
    }
    for (let length = 1; length < version.parts.length; length++) {
      const floating = `${version.prefix}${version.parts.slice(0, length).join('.')}`;
      const existing = result.get(floating);
      if (!dates.has(floating) && (!existing || existing < date)) {
        result.set(floating, date);
      }
    }
  }
  return result;
}
