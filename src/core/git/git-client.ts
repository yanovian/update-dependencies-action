import { runProcess } from '../commands/run-process.js';
import { writeTempFile } from '../util/write-temp-file.js';

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

export interface GitClient {
  hasUncommittedChanges(): Promise<boolean>;
  createBranch(branchName: string): Promise<void>;
  commit(paths: readonly string[], message: string): Promise<void>;
  push(branchName: string): Promise<void>;
}

/** Operates on whatever the calling workflow already checked out; this Action never fetches or
 * resets anything, it just branches off the current working tree (which already has the
 * plugins' edits) and force-pushes, so re-runs update the same branch/PR instead of piling up
 * a new one every time. */
export function createGitClient(repoRoot: string): GitClient {
  const git = (args: string) => runProcess(`git ${args}`, { cwd: repoRoot });

  return {
    async hasUncommittedChanges(): Promise<boolean> {
      const result = await git('status --porcelain');
      return result.stdout.trim().length > 0;
    },
    async createBranch(branchName: string): Promise<void> {
      await git(`checkout -B ${branchName}`);
    },
    /** Only adds the given paths, never the whole tree: a plugin only ever touches the
     * directories it was asked to update, so nothing outside that list, an unrelated dirty file
     * already sitting in the checkout, a stray build artifact, this Action's own summary file,
     * can ever end up in the commit. */
    async commit(paths: readonly string[], message: string): Promise<void> {
      await git(`config user.name "${BOT_NAME}"`);
      await git(`config user.email "${BOT_EMAIL}"`);
      const quotedPaths = paths.map((path) => `"${path}"`).join(' ');
      await git(`add -- ${quotedPaths}`);
      const messagePath = await writeTempFile(
        'update-dependencies-commit-',
        'message.txt',
        message,
      );
      await git(`commit -F "${messagePath}"`);
    },
    async push(branchName: string): Promise<void> {
      await git(`push origin ${branchName} --force`);
    },
  };
}
