import { describe, expect, it } from 'vitest';
import { buildPullRequestBody, buildPullRequestTitle } from './pr-body-builder.js';

const CHANGE = {
  ecosystem: 'npm' as const,
  path: 'app',
  name: 'left-pad',
  fromVersion: '1.0.0',
  toVersion: '2.0.0',
  breaking: true,
};

describe('buildPullRequestTitle', () => {
  it('counts unique packages and paths', () => {
    const title = buildPullRequestTitle([CHANGE, { ...CHANGE, name: 'other' }], 'breaking');
    expect(title).toBe('chore(deps): breaking update of 2 package(s) across 1 path(s)');
  });
});

describe('buildPullRequestBody', () => {
  it('includes the changes table, commands run, and the credit/test-before-merging footer', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [CHANGE],
      manualActionNeeded: [],
      commandResults: [{ command: 'npm test', exitCode: 0 }],
    });

    expect(body).toContain('| npm | app | left-pad | 1.0.0 | 2.0.0 | Breaking |');
    expect(body).toContain('`npm test`');
    expect(body).toContain('Update Dependencies');
    expect(body).toContain('review and test this change yourself before merging');
  });

  it('includes a manual-action-needed section when there is one', () => {
    const body = buildPullRequestBody({
      mode: 'breaking',
      changes: [],
      manualActionNeeded: [
        { ecosystem: 'go', path: '.', name: 'github.com/foo/bar', reason: 'new major available' },
      ],
      commandResults: [],
    });
    expect(body).toContain('Needs a manual look');
    expect(body).toContain('new major available');
  });

  it('omits the commands section when no commands were run', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [CHANGE],
      manualActionNeeded: [],
      commandResults: [],
    });
    expect(body).not.toContain('Commands run');
  });
});
