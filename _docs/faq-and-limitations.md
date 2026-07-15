# FAQ and limitations

## Why does it need write permissions?

Pushing the update branch and opening the pull request both need `contents: write` and
`pull-requests: write`. There is no way around this. See
[permissions and tokens](../README.md#permissions-and-tokens) in the README for the exact
workflow permissions block.

## Can I trigger this on `pull_request`?

Don't. GitHub gives the default `GITHUB_TOKEN` read-only access on a `pull_request` run from a
fork no matter what permissions your workflow requests, so pushing a branch and opening a pull
request will fail. This Action is meant to run on a `schedule` or `workflow_dispatch`, updating
your default branch and opening its own pull request. The example workflow in the README uses
exactly that setup.

## What does "needs a manual look" in the pull request mean?

Some things this Action finds are deliberately left alone rather than guessed at:

- A Go dependency with a newer major version. Go encodes majors in the import path, so moving to
  it means changing source code, not just a version number.
- A Gradle dependency declared in a form this Action doesn't confidently recognize (a version
  variable, a map-style declaration it can't resolve).

These are listed in the pull request body so you know to look at them yourself, instead of being
silently skipped.

## What happens if I don't give it any commands?

`check-commands` is optional. With nothing in it, this Action updates dependencies and opens the
pull request straight away, with nothing to gate on beforehand.

That is a legitimate way to run it, not just a fallback. If your repo already runs CI on every
pull request, you don't need to duplicate your whole test suite inside `check-commands`. Let this
Action update dependencies and open the pull request, then let your existing pull request CI
check it the same way it checks every other pull request. If something breaks, it breaks there,
and you fix it in the pull request instead of paying for the same commands to run twice, once
inside this Action and once again on the pull request itself.

For your existing pull request CI to actually run on the pull request this Action opens, use a
PAT, see the next question for why and how.

## Why does the README recommend a PAT instead of the default token?

GitHub deliberately stops the default `GITHUB_TOKEN` from triggering other workflows, including
your repo's own `pull_request` checks, to prevent automation from looping into itself forever.
That is fine if you use `check-commands` for everything, but it means the pull request this
Action opens won't get your normal CI checks unless you give it a stronger token.

The fix is a fine-grained personal access token (PAT):

1. Go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens** on
   GitHub and generate a new token.
2. Set repository access to only the repo (or repos) this Action runs against.
3. Under repository permissions, grant **Contents: Read and write** and
   **Pull requests: Read and write**. Nothing else is needed.
4. Copy the token, then add it as a repo secret: **Settings → Secrets and variables → Actions →
   New repository secret**. Name it `PAT_TOKEN`.
5. Reference it in your workflow instead of the default token:

```yaml
github-token: ${{ secrets.PAT_TOKEN }}
```

The example workflows in the README and under `examples/workflows/` already use `PAT_TOKEN`.

## What happens if a command fails?

The whole run fails, and no pull request is created or updated. The updated files are left in the
runner's working tree but never pushed anywhere, so nothing in your repo changes. Check the
Action's log, each command runs in its own log group so the failing one is easy to spot.

## Does it create a new pull request every time it runs?

No. It always pushes to the same branch (`update-dependencies/<update-strategy>` by default) and
reuses the existing open pull request for that branch if there is one, updating its title and
description instead of opening a duplicate.

## Can I scan only part of my repo?

Yes, set `working-directory`. Or use `ignorePaths` in the config file to skip specific
directories while still scanning the rest of the repo.

## Can I ignore a single package?

Not yet. You can turn off a whole ecosystem with the config file, but excluding one specific
package from an otherwise-updated ecosystem isn't supported. Some of the update commands this
Action uses (`npm update`, `bundle update`, and so on) don't have a clean "update everything
except this one package" mode, so doing this safely across every ecosystem needs more work than
a first version can promise correctly.

## Does it work with a private registry?

Not in this version. Every update command runs with whatever registry configuration is already
present in the checkout (an `.npmrc`, a Maven `settings.xml`, and so on), so if your workflow
already sets that up before this Action runs, private packages should resolve fine for detection.
Authenticating to a private registry on this Action's behalf isn't handled separately.

## A note on trust

Passing commands is not a substitute for a human check. A test suite can pass and a dependency
update can still change runtime behavior your tests don't cover. Review the diff, especially for
a breaking update, before you merge.
