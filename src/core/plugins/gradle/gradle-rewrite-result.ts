import type { ManualNote, PackageChange } from '../../types/ecosystem-plugin.js';

export interface UpdateCandidate {
  readonly from: string;
  readonly to: string;
}

export interface RewriteResult {
  readonly changes: PackageChange[];
  readonly manualActionNeeded: ManualNote[];
  readonly appliedGroupArtifacts: ReadonlySet<string>;
}

export function emptyRewriteResult(): {
  changes: PackageChange[];
  manualActionNeeded: ManualNote[];
  appliedGroupArtifacts: Set<string>;
} {
  return { changes: [], manualActionNeeded: [], appliedGroupArtifacts: new Set() };
}
