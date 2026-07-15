import * as github from '@actions/github';

/** Every workflow event GitHub sends to an Action includes the repository, and its default
 * branch, in the payload, except a few (like `workflow_call` without a repository context in
 * some setups); falling back to one extra API call covers those. */
export async function resolveBaseBranch(
  githubToken: string,
  inputBaseBranch: string,
): Promise<string> {
  if (inputBaseBranch) {
    return inputBaseBranch;
  }

  const fromPayload = github.context.payload.repository?.default_branch;
  if (fromPayload) {
    return fromPayload;
  }

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}
