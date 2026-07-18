import { describe, expect, it } from 'vitest';
import { runPinCommand, runProcess } from './run-process.js';

describe('runProcess', () => {
  it('resolves with the result when the command succeeds', async () => {
    const result = await runProcess('echo hi', { cwd: process.cwd() });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hi');
  });

  it('throws, naming the command and exit code, when the command fails', async () => {
    await expect(runProcess('exit 3', { cwd: process.cwd() })).rejects.toThrow(
      'Command failed with exit code 3: exit 3',
    );
  });

  it("includes the command's own stderr in the failure message", async () => {
    await expect(
      runProcess('echo "boom: something specific went wrong" 1>&2 && exit 1', {
        cwd: process.cwd(),
      }),
    ).rejects.toThrow('boom: something specific went wrong');
  });

  it('falls back to stdout when there is no stderr', async () => {
    await expect(
      runProcess('echo "only stdout here" && exit 1', { cwd: process.cwd() }),
    ).rejects.toThrow('only stdout here');
  });

  it('resolves instead of throwing when allowFailure is set', async () => {
    const result = await runProcess('exit 3', { cwd: process.cwd(), allowFailure: true });
    expect(result.exitCode).toBe(3);
  });
});

describe('runPinCommand', () => {
  it('resolves true when the command succeeds', async () => {
    await expect(runPinCommand('exit 0', process.cwd())).resolves.toBe(true);
  });

  it('resolves false, without throwing, when the command fails', async () => {
    await expect(runPinCommand('exit 1', process.cwd())).resolves.toBe(false);
  });
});
