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
