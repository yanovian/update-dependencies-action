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

const BASE_OPTIONS = {
  manualActionNeeded: [],
  ageGateNotes: [],
  minReleaseAgeDays: 3,
  commandResults: [],
  runDate: '2026-07-16',
  stalePullRequests: [],
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
      ...BASE_OPTIONS,
      mode: 'non-breaking',
      changes: [CHANGE],
      commandResults: [{ command: 'npm test', exitCode: 0 }],
    });

    expect(body).toContain('**Run date:** 2026-07-16');
    expect(body).toContain('| npm | app | left-pad | 1.0.0 | 2.0.0 | Breaking |');
    expect(body).toContain('`npm test`');
    expect(body).toContain('Update Dependencies');
    expect(body).toContain('Why keep dependencies updated');
    expect(body).toContain('responsibility of the dev, QA, and test teams');
  });

  it('mentions the release-age policy in the run date note when enabled', () => {
    const body = buildPullRequestBody({ ...BASE_OPTIONS, mode: 'non-breaking', changes: [CHANGE] });
    expect(body).toContain('Versions younger than 3 day(s) are held back');
  });

  it('omits the release-age policy note when the gate is disabled', () => {
    const body = buildPullRequestBody({
      ...BASE_OPTIONS,
      mode: 'non-breaking',
      changes: [CHANGE],
      minReleaseAgeDays: 0,
    });
    expect(body).not.toContain('held back');
  });

  it('labels a range-only change as indirect', () => {
    const body = buildPullRequestBody({
      ...BASE_OPTIONS,
      mode: 'non-breaking',
      changes: [{ ...CHANGE, breaking: false, indirect: true }],
    });
    expect(body).toContain('| npm | app | left-pad | 1.0.0 | 2.0.0 | Non-breaking (indirect) |');
  });

  it('includes a manual-action-needed section when there is one', () => {
    const body = buildPullRequestBody({
      ...BASE_OPTIONS,
      mode: 'breaking',
      changes: [],
      manualActionNeeded: [
        { ecosystem: 'go', path: '.', name: 'github.com/foo/bar', reason: 'new major available' },
      ],
    });
    expect(body).toContain('Needs a manual look');
    expect(body).toContain('new major available');
  });

  it('includes a release-age policy section when there are age-gate notes', () => {
    const body = buildPullRequestBody({
      ...BASE_OPTIONS,
      mode: 'non-breaking',
      changes: [CHANGE],
      ageGateNotes: [
        { ecosystem: 'npm', path: 'app', name: 'left-pad', reason: 'capped to an older version' },
      ],
    });
    expect(body).toContain('## Release-age policy');
    expect(body).toContain('capped to an older version');
  });

  it('omits the commands section when no commands were run', () => {
    const body = buildPullRequestBody({ ...BASE_OPTIONS, mode: 'non-breaking', changes: [CHANGE] });
    expect(body).not.toContain('Commands run');
  });

  it('omits the stale pull requests section when there are none', () => {
    const body = buildPullRequestBody({ ...BASE_OPTIONS, mode: 'non-breaking', changes: [CHANGE] });
    expect(body).not.toContain('Other open pull requests');
  });

  it('lists stale pull requests and recommends closing them, with a disclaimer', () => {
    const body = buildPullRequestBody({
      ...BASE_OPTIONS,
      mode: 'non-breaking',
      changes: [CHANGE],
      stalePullRequests: [STALE_PR],
    });
    expect(body).toContain('Other open pull requests from this Action');
    expect(body).toContain('#41');
    expect(body).toContain('chore/update-deps/non-breaking/2026-07-01');
    expect(body).toContain('recommend closing');
    expect(body).toContain('Double-check each one first');
  });
});
