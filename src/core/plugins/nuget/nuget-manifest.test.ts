import { describe, expect, it } from 'vitest';
import { detectNuGetManifests } from './nuget-manifest.js';

describe('detectNuGetManifests', () => {
  it('finds every .csproj in the repo', () => {
    expect(detectNuGetManifests(['src/Api/Api.csproj', 'src/Lib/Lib.csproj'])).toEqual([
      {
        ecosystem: 'nuget',
        language: 'C#/.NET',
        manifestPath: 'src/Api/Api.csproj',
        directory: 'src/Api',
      },
      {
        ecosystem: 'nuget',
        language: 'C#/.NET',
        manifestPath: 'src/Lib/Lib.csproj',
        directory: 'src/Lib',
      },
    ]);
  });
});
