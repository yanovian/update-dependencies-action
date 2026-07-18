import type { PackageChange } from '../types/ecosystem-plugin.js';

// Different manifests (different files, different directories) are independent and safe to
// evaluate in parallel; changes within the *same* manifest stay sequential (see
// `groupByManifest`), since two pins racing to read-modify-write the same file would lose one of
// the writes.
const MANIFEST_CONCURRENCY = 8;

/**
 * Runs `evaluateOne` over every change, grouped by manifest: groups run concurrently (bounded),
 * but changes within one group run one at a time, in order, so two changes destined for the same
 * file never race to read-modify-write it.
 */
export async function evaluateGroupedByManifest<T>(
  changes: readonly PackageChange[],
  evaluateOne: (change: PackageChange) => Promise<T>,
): Promise<T[]> {
  const groups = groupByManifest(changes);
  const groupResults = await mapWithConcurrency(groups, MANIFEST_CONCURRENCY, (group) =>
    evaluateSequentially(group, evaluateOne),
  );
  return groupResults.flat();
}

function groupByManifest(changes: readonly PackageChange[]): PackageChange[][] {
  const groups = new Map<string, PackageChange[]>();
  for (const change of changes) {
    const key = `${change.ecosystem}::${change.path}`;
    const group = groups.get(key);
    if (group) {
      group.push(change);
    } else {
      groups.set(key, [change]);
    }
  }
  return [...groups.values()];
}

async function evaluateSequentially<T>(
  group: readonly PackageChange[],
  evaluateOne: (change: PackageChange) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (const change of group) {
    results.push(await evaluateOne(change));
  }
  return results;
}

/** A small worker pool: a bounded number of items in flight at once, rather than one
 * `Promise.all` over everything (which would fire every request simultaneously). */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (let index = nextIndex++; index < items.length; index = nextIndex++) {
      const item = items[index];
      if (item !== undefined) {
        results[index] = await fn(item);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
