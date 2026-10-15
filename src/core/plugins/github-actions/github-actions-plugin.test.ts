import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../logging/logger.js';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';
import { createGitHubActionsPlugin } from './github-actions-plugin.js';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), group: (_name, fn) => fn() };
const SHA_V3 = '3'.repeat(40);
const SHA_V3_1 = '4'.repeat(40);

const TAGS: Record<string, Map<string, string>> = {
  'actions/checkout': new Map([
    ['v3', '1'.repeat(40)],
    ['v4', '2'.repeat(40)],
    ['v4.1.0', '5'.repeat(40)],
    ['v4.2.0', '6'.repeat(40)],
  ]),
  'github/codeql-action': new Map([
    ['v3.0.0', SHA_V3],
    ['v3.1.0', SHA_V3_1],
  ]),
};
const lookupTags = vi.fn(async (repo: string) => TAGS[repo] ?? null);

const WORKFLOWS: ManifestLocation = {
  ecosystem: 'github-actions',
  language: 'GitHub Actions',
  manifestPath: '.github/workflows/ci.yml',
  directory: '.github/workflows',
};

let repoRoot: string;

async function writeWorkflow(name: string, contents: string): Promise<void> {
  await writeFile(path.join(repoRoot, '.github/workflows', name), contents);
}

function readWorkflow(name: string): Promise<string> {
  return readFile(path.join(repoRoot, '.github/workflows', name), 'utf8');
}

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), 'gha-plugin-'));
  await mkdir(path.join(repoRoot, '.github/workflows'), { recursive: true });
  lookupTags.mockClear();
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe('github-actions plugin', () => {
  it('detects workflow files and composite actions, one location per directory', () => {
    const plugin = createGitHubActionsPlugin(lookupTags);
    const locations = plugin.detectManifests([
      '.github/workflows/ci.yml',
      '.github/workflows/release.yaml',
      '.github/actions/setup/action.yml',
      'docs/config.yml',
    ]);
    expect(locations.map((location) => location.directory)).toEqual([
      '.github/actions/setup',
      '.github/workflows',
    ]);
  });

  it('bumps floating majors in breaking mode across every file, reported once', async () => {
    await writeWorkflow('a.yml', '    steps:\n      - uses: actions/checkout@v3\n');
    await writeWorkflow('b.yaml', '    steps:\n      - uses: actions/checkout@v3\n');
    const plugin = createGitHubActionsPlugin(lookupTags);

    const result = await plugin.update(WORKFLOWS, 'breaking', { repoRoot, logger });

    expect(result.changes).toEqual([
      {
        ecosystem: 'github-actions',
        path: '.github/workflows',
        name: 'actions/checkout',
        fromVersion: 'v3',
        toVersion: 'v4',
        breaking: true,
      },
    ]);
    expect(result.diskChangeExplained).toBe(true);
    await expect(readWorkflow('a.yml')).resolves.toContain('actions/checkout@v4\n');
    await expect(readWorkflow('b.yaml')).resolves.toContain('actions/checkout@v4\n');
    expect(lookupTags).toHaveBeenCalledTimes(1);
  });

  it('moves a SHA-pinned ref to the new tag commit and comment', async () => {
    await writeWorkflow('ci.yml', `      - uses: github/codeql-action/init@${SHA_V3} # v3.0.0\n`);
    const plugin = createGitHubActionsPlugin(lookupTags);

    const result = await plugin.update(WORKFLOWS, 'non-breaking', { repoRoot, logger });

    expect(result.changes[0]).toMatchObject({ fromVersion: 'v3.0.0', toVersion: 'v3.1.0' });
    await expect(readWorkflow('ci.yml')).resolves.toBe(
      `      - uses: github/codeql-action/init@${SHA_V3_1} # v3.1.0\n`,
    );
  });

  it('leaves branches alone and flags bare SHAs and unreadable repos', async () => {
    const contents = [
      '      - uses: actions/checkout@main',
      `      - uses: actions/checkout@${SHA_V3}`,
      '      - uses: private/action@v1',
      '',
    ].join('\n');
    await writeWorkflow('ci.yml', contents);
    const plugin = createGitHubActionsPlugin(lookupTags);

    const result = await plugin.update(WORKFLOWS, 'breaking', { repoRoot, logger });

    expect(result.changes).toEqual([]);
    expect(result.manualActionNeeded.map((note) => note.name)).toEqual([
      'actions/checkout',
      'private/action',
    ]);
    await expect(readWorkflow('ci.yml')).resolves.toBe(contents);
  });

  it('pins back to a same-shape tag, and refuses to change the shape', async () => {
    await writeWorkflow('ci.yml', '      - uses: actions/checkout@v4.2.0\n');
    const plugin = createGitHubActionsPlugin(lookupTags);
    const ctx = { repoRoot, logger };

    await expect(
      plugin.pinVersion?.(
        WORKFLOWS,
        { name: 'actions/checkout', fromVersion: 'v4.2.0', version: 'v4' },
        ctx,
      ),
    ).resolves.toBe(false);
    await expect(
      plugin.pinVersion?.(
        WORKFLOWS,
        { name: 'actions/checkout', fromVersion: 'v4.2.0', version: 'v4.1.0' },
        ctx,
      ),
    ).resolves.toBe(true);
    await expect(readWorkflow('ci.yml')).resolves.toBe('      - uses: actions/checkout@v4.1.0\n');
  });
});
