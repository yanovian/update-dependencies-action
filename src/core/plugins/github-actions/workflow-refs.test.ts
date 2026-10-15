import { describe, expect, it } from 'vitest';
import { parseActionRefs, rewriteActionRefs } from './workflow-refs.js';

const SHA_OLD = 'a'.repeat(40);
const SHA_NEW = 'b'.repeat(40);

const WORKFLOW = `jobs:
  build:
    uses: octo/shared/.github/workflows/ci.yml@v1
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: "actions/setup-node@v4.1.0" # keep
      - uses: github/codeql-action/init@${SHA_OLD} # v3.25.0
      - uses: owner/tracked@main
      - uses: ./local-action
      - uses: docker://alpine:3
      - uses: owner/bare-sha@${SHA_OLD}
`;

describe('parseActionRefs', () => {
  it('finds every remote action and reusable workflow, with its version', () => {
    expect(parseActionRefs(WORKFLOW)).toEqual([
      { repo: 'octo/shared', ref: 'v1', pinnedSha: null, version: 'v1' },
      { repo: 'actions/checkout', ref: 'v4', pinnedSha: null, version: 'v4' },
      { repo: 'actions/setup-node', ref: 'v4.1.0', pinnedSha: null, version: 'v4.1.0' },
      { repo: 'github/codeql-action', ref: SHA_OLD, pinnedSha: SHA_OLD, version: 'v3.25.0' },
      { repo: 'owner/tracked', ref: 'main', pinnedSha: null, version: null },
      { repo: 'owner/bare-sha', ref: SHA_OLD, pinnedSha: SHA_OLD, version: null },
    ]);
  });

  it('reads the version from tag= style SHA comments', () => {
    const [ref] = parseActionRefs(`      - uses: a/b@${SHA_OLD} # tag=v2.0.1\n`);
    expect(ref?.version).toBe('v2.0.1');
  });
});

describe('rewriteActionRefs', () => {
  it('changes only the ref, keeping quotes, subpaths, and comments', () => {
    const updated = rewriteActionRefs(WORKFLOW, (ref) => {
      if (ref.repo === 'actions/setup-node') {
        return { version: 'v4.2.0', sha: null };
      }
      if (ref.repo === 'github/codeql-action') {
        return { version: 'v3.26.0', sha: SHA_NEW };
      }
      return null;
    });

    expect(updated).toBe(
      WORKFLOW.replace('setup-node@v4.1.0" # keep', 'setup-node@v4.2.0" # keep').replace(
        `init@${SHA_OLD} # v3.25.0`,
        `init@${SHA_NEW} # v3.26.0`,
      ),
    );
  });

  it('returns the input unchanged when nothing is rewritten', () => {
    expect(rewriteActionRefs(WORKFLOW, () => null)).toBe(WORKFLOW);
  });
});
