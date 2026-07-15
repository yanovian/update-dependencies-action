import * as github from '@actions/github';

type Octokit = ReturnType<typeof github.getOctokit>;

export interface PullRequestResult {
  readonly number: number;
  readonly url: string;
}

export interface PullRequestOptions {
  readonly githubToken: string;
  readonly baseBranch: string;
  readonly branchName: string;
  readonly title: string;
  readonly body: string;
}

/** Reuses an already-open pull request for this branch instead of opening a new one on every
 * run, the same "don't spam" idea as updating an existing bot comment elsewhere. */
export async function createOrUpdatePullRequest(
  options: PullRequestOptions,
): Promise<PullRequestResult> {
  const octokit = github.getOctokit(options.githubToken);
  const { owner, repo } = github.context.repo;

  const existingNumber = await findOpenPullRequestNumber(octokit, owner, repo, options.branchName);
  if (existingNumber) {
    const { data } = await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: existingNumber,
      title: options.title,
      body: options.body,
    });
    return { number: data.number, url: data.html_url };
  }

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    head: options.branchName,
    base: options.baseBranch,
    title: options.title,
    body: options.body,
  });
  return { number: data.number, url: data.html_url };
}

async function findOpenPullRequestNumber(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
): Promise<number | null> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${branchName}`,
    state: 'open',
  });
  return data[0]?.number ?? null;
}
