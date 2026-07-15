# Configuration

Everything that changes how a single run behaves is a workflow input. The config file is only
for the one thing that needs to persist across runs and doesn't fit as an input: which
ecosystems and paths to skip.

## Inputs

| Input | Default | What it does |
| --- | --- | --- |
| `update-strategy` | `non-breaking` | `non-breaking` keeps every package within its current major version. `breaking` allows major version jumps too. |
| `check-commands` | (empty) | Commands to run after updating, one per line, in order. Every command must exit 0 or no pull request is created. Leave empty to skip straight to the pull request once dependencies are updated. |
| `create-pull-request` | `true` | Whether to open a pull request when there are updates and every command passed. Set to `false` to leave the updated files in the working tree instead, for example if you want to commit them yourself in a later step. |
| `base-branch` | repo default branch | Branch the pull request is opened against. |
| `branch-name` | `update-dependencies/<update-strategy>` | Branch this Action commits to. Re-running the workflow force-pushes the same branch and reuses the existing pull request instead of opening a new one. |
| `config-path` | `.github/update-dependencies.yml` | Path to the config file described below. Missing is fine, everything is scanned by default. |
| `working-directory` | `.` | Directory to scan, relative to the repo root. Use this if the Action should only look at part of a larger repo. |
| `github-token` | `${{ github.token }}` | Token used to push the branch and open the pull request. See [permissions and tokens](../README.md#permissions-and-tokens) in the README. |

## Outputs

| Output | Description |
| --- | --- |
| `updated` | `true` if any dependency was updated. |
| `pull-request-number` | Number of the pull request that was created or updated, if any. |
| `pull-request-url` | URL of the pull request that was created or updated, if any. |
| `changes-summary-path` | Path to a JSON file, written into the repo checkout, with every change and manual-action note from this run. |
| `commands-passed` | `true` if every command in `check-commands` exited successfully. |

## Config file

Save this as `.github/update-dependencies.yml` (or point `config-path` somewhere else):

```yaml
version: 1

ecosystems:
  npm: true
  gradle: false # turn an ecosystem off even if this Action finds it in the repo

ignorePaths:
  - examples
  - test-fixtures
```

- `ecosystems`: set any of `npm`, `yarn`, `pnpm`, `pip`, `cargo`, `go`, `maven`, `gradle`,
  `rubygems`, `composer`, `nuget` to `false` to skip it. Anything not listed is scanned.
- `ignorePaths`: a list of path prefixes, relative to the repo root, to skip entirely. A manifest
  is skipped if its directory equals or sits inside one of these prefixes. This is a prefix
  match, not a glob pattern.

Per-package ignoring is not supported yet. See
[FAQ and limitations](faq-and-limitations.md) for why.
