import type { EcosystemId } from '../types/ecosystem-plugin.js';
import { fetchJsonWithRetry } from './http-retry.js';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
// OSV's documented limit per querybatch request.
const BATCH_CHUNK_SIZE = 1000;

const OSV_ECOSYSTEM_NAMES: Record<EcosystemId, string> = {
  npm: 'npm',
  yarn: 'npm',
  pnpm: 'npm',
  pip: 'PyPI',
  cargo: 'crates.io',
  go: 'Go',
  maven: 'Maven',
  gradle: 'Maven',
  rubygems: 'RubyGems',
  composer: 'Packagist',
  nuget: 'NuGet',
};

export interface VulnerabilityQuery {
  readonly ecosystem: EcosystemId;
  readonly name: string;
  readonly version: string;
}

export interface VulnerabilityMatch {
  readonly query: VulnerabilityQuery;
  readonly vulnerabilityIds: readonly string[];
}

interface OsvBatchQuery {
  readonly version: string;
  readonly package: { readonly name: string; readonly ecosystem: string };
}

interface OsvBatchResult {
  readonly vulns?: { readonly id: string }[];
}

interface OsvBatchResponse {
  readonly results?: OsvBatchResult[];
}

/**
 * Checks each entry's *current* version for known vulnerabilities, batched into as few requests
 * as possible. A hit is reason enough to bypass the release-age gate for that package: the
 * version already in the repo has a documented flaw, so waiting on the fix's own freshness is
 * the wrong tradeoff even if the fix landed minutes ago. Returns null on any lookup failure so
 * the caller can fail open rather than treat "couldn't check" as "definitely not vulnerable".
 */
export async function findVulnerableEntries(
  queries: readonly VulnerabilityQuery[],
): Promise<VulnerabilityMatch[] | null> {
  if (queries.length === 0) {
    return [];
  }

  const matches: VulnerabilityMatch[] = [];
  for (const batch of chunk(queries, BATCH_CHUNK_SIZE)) {
    const response = await fetchJsonWithRetry<OsvBatchResponse>(OSV_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: batch.map(toOsvQuery) }),
    });
    if (!response) {
      return null;
    }

    const results = response.results ?? [];
    batch.forEach((query, index) => {
      const vulnerabilityIds = results[index]?.vulns?.map((vuln) => vuln.id) ?? [];
      if (vulnerabilityIds.length > 0) {
        matches.push({ query, vulnerabilityIds });
      }
    });
  }
  return matches;
}

function toOsvQuery(query: VulnerabilityQuery): OsvBatchQuery {
  return {
    version: query.version,
    package: { name: query.name, ecosystem: OSV_ECOSYSTEM_NAMES[query.ecosystem] },
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
