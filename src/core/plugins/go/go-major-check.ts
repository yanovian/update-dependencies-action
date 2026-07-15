import type { ManualNote } from '../../types/ecosystem-plugin.js';

/** The Go module proxy requires case-sensitive paths to be escaped: each uppercase letter
 * becomes "!" followed by its lowercase form. */
function escapeModulePath(modulePath: string): string {
  return modulePath.replace(/[A-Z]/g, (char) => `!${char.toLowerCase()}`);
}

/** Go modules encode the major version in the import path from v2 onward (no suffix means v0
 * or v1), so "the next major" is a different path, not a different version of this one. */
function nextMajorModulePath(modulePath: string): string {
  const versionSuffixMatch = /^(.*)\/v(\d+)$/.exec(modulePath);
  if (versionSuffixMatch?.[1] && versionSuffixMatch[2]) {
    return `${versionSuffixMatch[1]}/v${Number(versionSuffixMatch[2]) + 1}`;
  }
  return `${modulePath}/v2`;
}

async function nextMajorExists(modulePath: string): Promise<boolean> {
  const url = `https://proxy.golang.org/${escapeModulePath(nextMajorModulePath(modulePath))}/@latest`;
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Crossing a Go module major version boundary means changing the import path in source code,
 * a code migration rather than a dependency bump, so this Action never attempts it. Instead it
 * checks the module proxy for each direct dependency and reports one as a manual-action note
 * when a newer major does exist, so the user at least knows to look.
 */
export async function detectNewerMajors(
  directModules: ReadonlyMap<string, string>,
  directoryPath: string,
): Promise<ManualNote[]> {
  const notes: ManualNote[] = [];
  for (const modulePath of directModules.keys()) {
    if (await nextMajorExists(modulePath)) {
      notes.push({
        ecosystem: 'go',
        path: directoryPath,
        name: modulePath,
        reason:
          `A newer major version of ${modulePath} is available. Go encodes the major version ` +
          'in the import path, so moving to it means updating import paths in source, not just ' +
          'the dependency version. This needs a manual look.',
      });
    }
  }
  return notes;
}
