import { readFileIfPresent } from '../../util/read-file-if-present.js';
import { runProcess } from '../../commands/run-process.js';
import type { Logger } from '../../logging/logger.js';
import path from 'node:path';

/** Only refreshes lock state if the project already opted into Gradle's dependency locking;
 * plain Gradle builds have no lockfile and nothing to refresh. A failure here is logged but
 * does not fail the whole plugin, since the version bump itself already succeeded. */
export async function refreshDependencyLocksIfEnabled(
  dir: string,
  gradleCommand: string,
  logger: Logger,
): Promise<void> {
  const hasLockfile = (await readFileIfPresent(path.join(dir, 'gradle.lockfile'))) !== null;
  if (!hasLockfile) {
    return;
  }
  const result = await runProcess(`${gradleCommand} --write-locks --console=plain -q`, {
    cwd: dir,
  });
  if (result.exitCode !== 0) {
    logger.warn(
      `gradle --write-locks exited with code ${result.exitCode} in ${dir}; lock state may be stale.`,
    );
  }
}
