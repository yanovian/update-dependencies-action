import { isMajorBump } from '../../update/diff-versions.js';
import {
  emptyRewriteResult,
  type RewriteResult,
  type UpdateCandidate,
} from './gradle-rewrite-result.js';

// Matches the common quoted "group:artifact:version" dependency notation, e.g.
// implementation 'com.google.guava:guava:30.0-jre' or api("org.apache:x:1.0"). Map notation
// (group: 'x', name: 'y', version: 'z') and version-variable references aren't recognized and
// are left alone; the caller reports those as a manual-action note instead.
const DEPENDENCY_NOTATION = /(['"])([\w.-]+):([\w.-]+):([\w.-]+)\1/g;

/** Finds the version currently declared for one "group:artifact" dependency, used by
 * `pinVersion` to build the `{from, to}` pair `rewriteBuildFile` requires, since the file on
 * disk already holds this update's original (too-fresh) resolution, not the version from before
 * this run started. Only recognizes the same quoted shorthand notation `rewriteBuildFile` does. */
export function findDeclaredVersion(content: string, groupArtifact: string): string | null {
  const [group, artifact] = groupArtifact.split(':');
  if (!group || !artifact) {
    return null;
  }
  const pattern = new RegExp(
    `(['"])${escapeRegExp(group)}:${escapeRegExp(artifact)}:([\\w.-]+)\\1`,
  );
  return pattern.exec(content)?.[2] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rewriteBuildFile(
  original: string,
  candidates: ReadonlyMap<string, UpdateCandidate>,
  directoryPath: string,
): { content: string } & RewriteResult {
  const result = emptyRewriteResult();

  const content = original.replace(DEPENDENCY_NOTATION, (match: string, ...captured: string[]) => {
    const [quote, group, artifact, version] = captured;
    const groupArtifact = `${group}:${artifact}`;
    const candidate = candidates.get(groupArtifact);
    if (!candidate || candidate.from !== version) {
      return match;
    }

    result.changes.push({
      ecosystem: 'gradle',
      path: directoryPath,
      name: groupArtifact,
      fromVersion: candidate.from,
      toVersion: candidate.to,
      breaking: isMajorBump(candidate.from, candidate.to),
    });
    result.appliedGroupArtifacts.add(groupArtifact);
    return `${quote}${group}:${artifact}:${candidate.to}${quote}`;
  });

  return { content, ...result };
}
