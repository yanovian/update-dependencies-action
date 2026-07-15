import { spawn } from 'node:child_process';

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
}

export interface RunProcessOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Runs a command through the shell (so pipes, `&&`, and quoting in a user-supplied verification
 * command work as expected), streaming output live to the real stdout/stderr while also
 * capturing stdout for plugins that need to parse a tool's output (e.g. `npm ls --json`).
 */
export function runProcess(command: string, options: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout }));
  });
}
