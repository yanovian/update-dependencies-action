import type { ManualNote, PackageChange } from '../core/types/ecosystem-plugin.js';
import type { UpdateRepoResult } from '../core/update/update-repo.js';
import type { GateNotes } from './gate-changes.js';

/**
 * GitHub rejects any push that changes a file under `.github/workflows/` unless the token has
 * the `workflows` permission (`workflow` scope on a classic PAT), and the default
 * `GITHUB_TOKEN` can never be granted it. Rather than fail the whole run over that, the update
 * is pushed again without the workflow files, and the pull request says why they're missing.
 */
export const WORKFLOWS_DIR = '.github/workflows';

const WORKFLOW_PERMISSION_REJECTION = /refusing to allow .+ to (?:create or )?update workflow/i;

export class WorkflowPermissionError extends Error {
  constructor() {
    super('The token used to push cannot update workflow files.');
    this.name = 'WorkflowPermissionError';
  }
}

export function isWorkflowPermissionRejection(error: unknown): boolean {
  return error instanceof Error && WORKFLOW_PERMISSION_REJECTION.test(error.message);
}

interface Located {
  readonly ecosystem: string;
  readonly path: string;
}

function isWorkflowFileEntry(entry: Located): boolean {
  return entry.ecosystem === 'github-actions' && entry.path === WORKFLOWS_DIR;
}

export interface WithoutWorkflowFiles {
  readonly updateResult: UpdateRepoResult;
  readonly notes: GateNotes;
  /** False when the workflow files were the only thing to commit. */
  readonly hasOtherUpdates: boolean;
}

export function withoutWorkflowFileUpdates(
  updateResult: UpdateRepoResult,
  notes: GateNotes,
): WithoutWorkflowFiles {
  const changes = updateResult.changes.filter((change) => !isWorkflowFileEntry(change));
  const otherNotes = updateResult.manualActionNeeded.filter((note) => !isWorkflowFileEntry(note));
  const dropped = updateResult.changes.filter((change) => isWorkflowFileEntry(change));

  return {
    updateResult: {
      manifestsUpdated: updateResult.manifestsUpdated.filter(
        (manifest) =>
          !isWorkflowFileEntry({ ecosystem: manifest.ecosystem, path: manifest.directory }),
      ),
      changes,
      manualActionNeeded: [...otherNotes, skippedNote(dropped)],
    },
    notes: {
      stabilityNotes: notes.stabilityNotes.filter((note) => !isWorkflowFileEntry(note)),
      ageGateNotes: notes.ageGateNotes.filter((note) => !isWorkflowFileEntry(note)),
    },
    hasOtherUpdates: changes.length > 0 || otherNotes.length > 0,
  };
}

function skippedNote(dropped: readonly PackageChange[]): ManualNote {
  const list = dropped.map(
    (change) => `${change.name} ${change.fromVersion} → ${change.toVersion}`,
  );
  return {
    ecosystem: 'github-actions',
    path: WORKFLOWS_DIR,
    name: null,
    reason:
      `Left out of this pull request: ${list.join(', ')}. GitHub only lets a token with the ` +
      '`workflows` permission change workflow files, and the default `GITHUB_TOKEN` never has ' +
      'it. Use a fine-grained PAT with Workflows: Read and write as `github-token` to include ' +
      'them, or set `ecosystems.github-actions: false` in the config file to stop checking them.',
  };
}
