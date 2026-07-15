import type { Logger } from '../logging/logger.js';
import { runProcess } from './run-process.js';

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
}

export interface CommandRunSummary {
  readonly results: CommandResult[];
  readonly allSucceeded: boolean;
  readonly failedCommand: string | null;
}

export function parseCommands(rawInput: string): string[] {
  return rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * Runs every command in order, each inside its own log group so a failure is immediately
 * obvious in the Actions UI. Stops at the first failure; the caller decides what that means
 * (never create a pull request).
 */
export async function runCommands(
  commands: readonly string[],
  cwd: string,
  logger: Logger,
): Promise<CommandRunSummary> {
  const results: CommandResult[] = [];

  for (const [index, command] of commands.entries()) {
    const label = `Running command ${index + 1}/${commands.length}: ${command}`;
    const exitCode = await logger.group(label, async () => {
      logger.info(`$ ${command}`);
      return (await runProcess(command, { cwd })).exitCode;
    });
    results.push({ command, exitCode });
    if (exitCode !== 0) {
      logger.error(
        `Command ${index + 1}/${commands.length} failed (exit code ${exitCode}): ${command}`,
      );
      return { results, allSucceeded: false, failedCommand: command };
    }
  }

  return { results, allSucceeded: true, failedCommand: null };
}
