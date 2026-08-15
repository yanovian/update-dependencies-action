import path from 'node:path';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';
const LOCKFILE = 'pnpm-lock.yaml';

export interface PnpmLockContext {
  /** Directory (relative to the repo root) holding the pnpm-lock.yaml this package resolves
   * against. */
  readonly lockfileDir: string;
  /** This package's key in that lockfile's `importers` map. */
  readonly importerKey: string;
}

/**
 * A pnpm package resolves against a lockfile either right next to its own package.json (a
 * standalone project, or a workspace root), or against an ancestor workspace root's lockfile (a
 * workspace member, which has no lockfile of its own). Returns null when neither applies, i.e.
 * this package.json isn't a pnpm project at all.
 */
export function resolvePnpmLockContext(
  repoFiles: readonly string[],
  packageJsonPath: string,
): PnpmLockContext | null {
  const repoFileSet = new Set(repoFiles);
  const dir = path.dirname(packageJsonPath);

  if (repoFileSet.has(path.join(dir, LOCKFILE))) {
    return { lockfileDir: dir, importerKey: '.' };
  }

  const workspaceRoot = findWorkspaceRoot(repoFileSet, dir);
  if (!workspaceRoot || !repoFileSet.has(path.join(workspaceRoot, LOCKFILE))) {
    return null;
  }
  return { lockfileDir: workspaceRoot, importerKey: path.relative(workspaceRoot, dir) || '.' };
}

/** Walks up from `startDir` to the repo root looking for the pnpm-workspace.yaml that marks a
 * workspace root; pnpm workspaces are never nested, so the nearest one found is the answer. */
function findWorkspaceRoot(repoFileSet: ReadonlySet<string>, startDir: string): string | null {
  for (let dir = startDir; ; dir = path.dirname(dir)) {
    if (repoFileSet.has(path.join(dir, WORKSPACE_FILE))) {
      return dir;
    }
    if (dir === '.') {
      return null;
    }
  }
}
