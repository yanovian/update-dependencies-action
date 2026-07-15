import { describe, expect, it } from 'vitest';
import {
  detectGoManifests,
  directRequirementVersions,
  parseGoModRequirements,
} from './go-manifest.js';

describe('detectGoManifests', () => {
  it('finds go.mod anywhere in the repo', () => {
    expect(detectGoManifests(['services/api/go.mod'])).toEqual([
      {
        ecosystem: 'go',
        language: 'Go',
        manifestPath: 'services/api/go.mod',
        directory: 'services/api',
      },
    ]);
  });
});

describe('parseGoModRequirements', () => {
  it('parses single-line require statements', () => {
    const contents = `module example.com/app\n\nrequire github.com/pkg/errors v0.9.1\n`;
    expect(parseGoModRequirements(contents)).toEqual([
      { module: 'github.com/pkg/errors', version: 'v0.9.1', indirect: false },
    ]);
  });

  it('parses a require block, including the indirect marker', () => {
    const contents = `
module example.com/app

require (
	github.com/pkg/errors v0.9.1
	golang.org/x/sync v0.5.0 // indirect
)
`;
    expect(parseGoModRequirements(contents)).toEqual([
      { module: 'github.com/pkg/errors', version: 'v0.9.1', indirect: false },
      { module: 'golang.org/x/sync', version: 'v0.5.0', indirect: true },
    ]);
  });
});

describe('directRequirementVersions', () => {
  it('excludes indirect requirements', () => {
    const contents = `
require (
	github.com/pkg/errors v0.9.1
	golang.org/x/sync v0.5.0 // indirect
)
`;
    expect(directRequirementVersions(contents)).toEqual(
      new Map([['github.com/pkg/errors', 'v0.9.1']]),
    );
  });
});
