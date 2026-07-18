import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunProcessOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Default false: a non-zero exit throws. Set true for the few callers that need to inspect
   * a failure themselves instead of having it treated as fatal (a check-command whose result is
   * reported rather than thrown, a best-effort step that only warns on failure). */
  readonly allowFailure?: boolean;
}

const FAILURE_OUTPUT_LIMIT = 2000;

/**
 * Runs a command through the shell (so pipes, `&&`, and quoting in a user-supplied verification
 * command work as expected), streaming output live to the real stdout/stderr while also
 * capturing both, for plugins that need to parse a tool's output (e.g. `npm ls --json`) and for
 * building a useful failure message.
 *
 * Throws on a non-zero exit by default, since that's what nearly every caller wants: an update
 * command that fails partway through should never be treated as if it succeeded. The error
 * message includes the tail of whatever the command printed, so the failure is understandable
 * from the top-level error alone (what shows up in GitHub's own failure annotation), not just by
 * scrolling back through the full log to find it.
 */
export async function runProcess(
  command: string,
  options: RunProcessOptions,
): Promise<ProcessResult> {
  const result = await spawnProcess(command, options);
  if (!options.allowFailure && result.exitCode !== 0) {
    const output = tail(result.stderr || result.stdout);
    throw new Error(
      `Command failed with exit code ${result.exitCode}: ${command}` +
        (output ? `\n${output}` : ''),
    );
  }
  return result;
}

/** Shared by every plugin's `pinVersion`: run one command, allowing it to fail, and boil the
 * result down to the one thing a pin attempt cares about, whether it worked. */
export async function runPinCommand(command: string, cwd: string): Promise<boolean> {
  const result = await runProcess(command, { cwd, allowFailure: true });
  return result.exitCode === 0;
}

function spawnProcess(command: string, options: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

function tail(output: string): string {
  const trimmed = output.trim();
  return trimmed.length > FAILURE_OUTPUT_LIMIT
    ? `...${trimmed.slice(-FAILURE_OUTPUT_LIMIT)}`
    : trimmed;
}
