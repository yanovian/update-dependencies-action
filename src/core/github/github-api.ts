import { fetchWithRetry } from '../security/http-retry.js';

/**
 * Read-only GitHub REST API lookups made outside the pull request flow (an action's tags and
 * release dates), over plain `fetch`, so nothing beyond the Node runtime this Action already
 * runs on is needed: no `gh`, no `git`, no extra setup step in the workflow.
 *
 * None of these may ever fail a run. Every failure returns null for the caller to fail open on,
 * and once GitHub reports its rate limit is exhausted, every later call this run returns null
 * straight away instead of spending requests (or waiting up to an hour for the limit to reset)
 * on lookups that would only be refused too.
 */

const API_ROOT = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 30_000;

let apiToken = '';
let rateLimited = false;
// Set when GitHub rejects the token itself (expired, revoked, or a fine-grained token scoped away
// from public repos). Every action lookup is a public read, so the rest of the run goes out
// unauthenticated instead of failing every lookup the same way.
let tokenRejected = false;

/** Set once from the `github-token` input. Empty is fine: requests then go out unauthenticated,
 * at GitHub's lower rate limit. */
export function setGitHubApiToken(token: string): void {
  apiToken = token;
}

/** For tests: forget a rate limit seen earlier in the same process. */
export function resetGitHubApiState(): void {
  rateLimited = false;
  tokenRejected = false;
}

function headers(withToken: boolean): Record<string, string> {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (withToken && apiToken && !tokenRejected) {
    result.Authorization = `Bearer ${apiToken}`;
  }
  return result;
}

/** GitHub signals both its primary limit (`x-ratelimit-remaining: 0`) and its secondary,
 * abuse-protection limit (a `retry-after` header) on a 403 or 429. */
function isRateLimitResponse(response: Response): boolean {
  return (
    (response.status === 403 || response.status === 429) &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))
  );
}

export interface GitHubApiPage<T> {
  readonly data: T;
  readonly nextUrl: string | null;
}

/** One GET against `path` (relative to the API root) or a full `next` URL from a previous page. */
export async function gitHubApiGet<T>(pathOrUrl: string): Promise<GitHubApiPage<T> | null> {
  if (rateLimited) {
    return null;
  }
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${API_ROOT}${pathOrUrl}`;
  const response = await requestWithTokenFallback(url);
  // No response at all means the network failed or a 429's retry budget ran out; either way the
  // next call would most likely spend the same wait for the same result.
  if (!response || isRateLimitResponse(response)) {
    rateLimited = true;
    return null;
  }
  if (!response.ok) {
    return null;
  }
  try {
    return { data: (await response.json()) as T, nextUrl: parseNextLink(response) };
  } catch {
    return null;
  }
}

/** Lookups run in parallel, so several can be in flight with the token when the first rejection
 * comes back; each one that was sent with it retries without it on its own. */
async function requestWithTokenFallback(url: string): Promise<Response | null> {
  const sentWithToken = Boolean(apiToken) && !tokenRejected;
  const response = await request(url, sentWithToken);
  if (!response || !sentWithToken || !isTokenRejection(response)) {
    return response;
  }
  tokenRejected = true;
  return request(url, false);
}

function request(url: string, withToken: boolean): Promise<Response | null> {
  return fetchWithRetry(url, {
    headers: headers(withToken),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** A 401 means the token itself is bad. A 404 with a token can also mean a fine-grained token
 * that can't see this repo, which a public repo would answer without one. */
function isTokenRejection(response: Response): boolean {
  return response.status === 401 || response.status === 404;
}

function parseNextLink(response: Response): string | null {
  const link = response.headers.get('link') ?? '';
  return /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
}
