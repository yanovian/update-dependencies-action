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

const STALE_PR = {
  number: 41,
  url: 'https://github.com/example/repo/pull/41',
  branchName: 'chore/update-deps/non-breaking/2026-07-01',
};

describe('buildPullRequestTitle', () => {
  it('counts unique packages and paths, and includes the run date', () => {
    const title = buildPullRequestTitle(
      [CHANGE, { ...CHANGE, name: 'other' }],
      'breaking',
      '2026-07-16',
    );
    expect(title).toBe(
      'chore(deps): breaking update of 2 package(s) across 1 path(s) (2026-07-16)',
    );
  });
});

describe('buildPullRequestBody', () => {
  it('includes the run date, changes table, commands run, security note, and footer', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [CHANGE],
      manualActionNeeded: [],
      commandResults: [{ command: 'npm test', exitCode: 0 }],
      runDate: '2026-07-16',
      stalePullRequests: [],
    });

    expect(body).toContain('**Run date:** 2026-07-16');
    expect(body).toContain('| npm | app | left-pad | 1.0.0 | 2.0.0 | Breaking |');
    expect(body).toContain('`npm test`');
    expect(body).toContain('Update Dependencies');
    expect(body).toContain('Why keep dependencies updated');
    expect(body).toContain('responsibility of the dev, QA, and test teams');
  });

  it('labels a range-only change as indirect', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [{ ...CHANGE, breaking: false, indirect: true }],
      manualActionNeeded: [],
      commandResults: [],
      runDate: '2026-07-16',
      stalePullRequests: [],
    });
    expect(body).toContain('| npm | app | left-pad | 1.0.0 | 2.0.0 | Non-breaking (indirect) |');
  });

  it('includes a manual-action-needed section when there is one', () => {
    const body = buildPullRequestBody({
      mode: 'breaking',
      changes: [],
      manualActionNeeded: [
        { ecosystem: 'go', path: '.', name: 'github.com/foo/bar', reason: 'new major available' },
      ],
      commandResults: [],
      runDate: '2026-07-16',
      stalePullRequests: [],
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
      runDate: '2026-07-16',
      stalePullRequests: [],
    });
    expect(body).not.toContain('Commands run');
  });

  it('omits the stale pull requests section when there are none', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [CHANGE],
      manualActionNeeded: [],
      commandResults: [],
      runDate: '2026-07-16',
      stalePullRequests: [],
    });
    expect(body).not.toContain('Other open pull requests');
  });

  it('lists stale pull requests and recommends closing them, with a disclaimer', () => {
    const body = buildPullRequestBody({
      mode: 'non-breaking',
      changes: [CHANGE],
      manualActionNeeded: [],
      commandResults: [],
      runDate: '2026-07-16',
      stalePullRequests: [STALE_PR],
    });
    expect(body).toContain('Other open pull requests from this Action');
    expect(body).toContain('#41');
    expect(body).toContain('chore/update-deps/non-breaking/2026-07-01');
    expect(body).toContain('recommend closing');
    expect(body).toContain('Double-check each one first');
  });
});
