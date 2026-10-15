import { describe, expect, it } from 'vitest';
import {
  isWorkflowPermissionRejection,
  withoutWorkflowFileUpdates,
} from './workflow-permission.js';

const WORKFLOW_CHANGE = {
  ecosystem: 'github-actions' as const,
  path: '.github/workflows',
  name: 'actions/checkout',
  fromVersion: 'v3',
  toVersion: 'v4',
  breaking: true,
};
const NPM_CHANGE = {
  ecosystem: 'npm' as const,
  path: '.',
  name: 'left-pad',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  breaking: false,
};

describe('isWorkflowPermissionRejection', () => {
  it('recognizes the push rejections GitHub sends for every token type', () => {
    for (const message of [
      'refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission',
      'refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml` without `workflow` scope',
      'refusing to allow a Personal Access Token to create or update workflow `.github/workflows/ci.yml` without `workflow` scope',
    ]) {
      expect(isWorkflowPermissionRejection(new Error(`Command failed\n${message}`))).toBe(true);
    }
    expect(isWorkflowPermissionRejection(new Error('remote: Permission denied'))).toBe(false);
  });
});

describe('withoutWorkflowFileUpdates', () => {
  it('drops workflow file changes and explains why in a note', () => {
    const result = withoutWorkflowFileUpdates(
      {
        manifestsUpdated: [
          {
            ecosystem: 'github-actions',
            language: 'GitHub Actions',
            manifestPath: '.github/workflows/ci.yml',
            directory: '.github/workflows',
          },
        ],
        changes: [WORKFLOW_CHANGE, NPM_CHANGE],
        manualActionNeeded: [],
      },
      { stabilityNotes: [], ageGateNotes: [] },
    );

    expect(result.hasOtherUpdates).toBe(true);
    expect(result.updateResult.manifestsUpdated).toEqual([]);
    expect(result.updateResult.changes).toEqual([NPM_CHANGE]);
    expect(result.updateResult.manualActionNeeded[0]?.reason).toContain('actions/checkout v3');
  });

  it('reports when the workflow files were the only updates', () => {
    const result = withoutWorkflowFileUpdates(
      { manifestsUpdated: [], changes: [WORKFLOW_CHANGE], manualActionNeeded: [] },
      { stabilityNotes: [], ageGateNotes: [] },
    );
    expect(result.hasOtherUpdates).toBe(false);
  });
});
