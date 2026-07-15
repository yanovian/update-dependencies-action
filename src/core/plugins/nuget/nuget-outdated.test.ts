import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runProcessMock } = vi.hoisted(() => ({ runProcessMock: vi.fn() }));
vi.mock('../../commands/run-process.js', () => ({ runProcess: runProcessMock }));

const { fetchOutdatedNuGetPackages } = await import('./nuget-outdated.js');

beforeEach(() => {
  runProcessMock.mockReset();
});

describe('fetchOutdatedNuGetPackages', () => {
  it('flattens topLevelPackages across frameworks, keeping the first occurrence of a package id', async () => {
    runProcessMock.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        projects: [
          {
            frameworks: [
              {
                topLevelPackages: [
                  { id: 'Newtonsoft.Json', resolvedVersion: '13.0.1', latestVersion: '13.0.3' },
                ],
              },
              {
                topLevelPackages: [
                  { id: 'Newtonsoft.Json', resolvedVersion: '13.0.1', latestVersion: '13.0.3' },
                ],
              },
            ],
          },
        ],
      }),
    });

    const result = await fetchOutdatedNuGetPackages('/repo/src', 'Api.csproj');

    expect(runProcessMock).toHaveBeenCalledWith(
      'dotnet list "Api.csproj" package --outdated --format json',
      { cwd: '/repo/src' },
    );
    expect(result).toEqual(
      new Map([
        [
          'Newtonsoft.Json',
          { id: 'Newtonsoft.Json', resolvedVersion: '13.0.1', latestVersion: '13.0.3' },
        ],
      ]),
    );
  });
});
