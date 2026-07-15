import path from 'node:path';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

export interface GoModRequirement {
  readonly module: string;
  readonly version: string;
  readonly indirect: boolean;
}

export function detectGoManifests(repoFiles: readonly string[]): ManifestLocation[] {
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'go.mod')
    .map((manifestPath) => ({
      ecosystem: 'go' as const,
      language: 'Go',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}

const REQUIREMENT_LINE = /^(\S+)\s+(\S+)(\s+\/\/\s*indirect)?/;

/** Parses both the single-line `require module version` form and the block
 * `require (\n  module version\n)` form that `gofmt`/`go mod tidy` normally produce. */
export function parseGoModRequirements(contents: string): GoModRequirement[] {
  const requirements: GoModRequirement[] = [];
  let inBlock = false;

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (/^require\s*\(/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line === ')') {
        inBlock = false;
        continue;
      }
      pushRequirement(requirements, line);
      continue;
    }
    const singleLineMatch = /^require\s+(.+)$/.exec(line);
    if (singleLineMatch?.[1]) {
      pushRequirement(requirements, singleLineMatch[1]);
    }
  }

  return requirements;
}

function pushRequirement(requirements: GoModRequirement[], line: string): void {
  const match = REQUIREMENT_LINE.exec(line);
  if (match?.[1] && match[2]) {
    requirements.push({ module: match[1], version: match[2], indirect: Boolean(match[3]) });
  }
}

export function directRequirementVersions(contents: string): Map<string, string> {
  return new Map(
    parseGoModRequirements(contents)
      .filter((requirement) => !requirement.indirect)
      .map((requirement) => [requirement.module, requirement.version]),
  );
}
