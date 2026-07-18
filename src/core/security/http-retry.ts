/**
 * Every registry client and the OSV client share this: on a 429 or 503, wait exactly as long as
 * the server's own `Retry-After` says (never a blind guess), retry, and give up after ~5.5
 * minutes of cumulative waiting so one rate-limited package can't stall the whole run. Every
 * failure mode (network error, retry budget exhausted, non-ok final status) returns null instead
 * of throwing, so callers can fail open uniformly: "couldn't verify" is never fatal to the run.
 */

const MAX_TOTAL_WAIT_MS = 5.5 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 2000;
// A server can send "Retry-After: 0" (or an already-past HTTP-date); without a floor, that
// resolves to a 0ms delay, which never advances `waitedMs` past the budget check below, so a
// server that keeps responding 429/503 would retry in a tight loop forever instead of failing
// open.
const MIN_RETRY_DELAY_MS = 250;

export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response | null> {
  let waitedMs = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return null;
    }

    if (response.status !== 429 && response.status !== 503) {
      return response;
    }

    const delayMs = Math.max(
      MIN_RETRY_DELAY_MS,
      parseRetryAfterMs(response.headers.get('retry-after')) ?? DEFAULT_RETRY_DELAY_MS,
    );
    if (waitedMs + delayMs > MAX_TOTAL_WAIT_MS) {
      return null;
    }
    await sleep(delayMs);
    waitedMs += delayMs;
  }
}

export async function fetchJsonWithRetry<T>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetchWithRetry(url, init);
  if (!response || !response.ok) {
    return null;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** `Retry-After` is either a whole number of seconds or an HTTP-date; either way, never negative. */
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(headerValue);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
