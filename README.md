# 📦 Update Dependencies

[![CI](https://github.com/yanovian/update-dependencies-action/actions/workflows/ci.yml/badge.svg)](https://github.com/yanovian/update-dependencies-action/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/yanovian/update-dependencies-action)](https://github.com/yanovian/update-dependencies-action/releases/latest)
[![License: MIT](https://img.shields.io/github/license/yanovian/update-dependencies-action)](LICENSE)

**Updates your dependencies, runs your tests, and only opens a pull request if everything still passes.**

> 🛒 [Check out on the Marketplace](https://github.com/marketplace/actions/update-dependencies)
>
> [Configuration →](_docs/configuration.md) · [Supported package managers →](_docs/supported-package-managers.md) · [FAQ →](_docs/faq-and-limitations.md)

- **Scans every package manager in your repo, in one run.** npm, Yarn, pnpm, pip, Cargo, Go,
  Maven, Gradle, Bundler, Composer, and NuGet, across every path in a monorepo, not just the root.
- **Runs your own checks first.** Your unit tests, integration tests, linter, build, whatever you
  already have, one at a time, clearly labeled in the Actions log.
- **Opens a pull request only if every check passes.** If anything fails, nothing gets pushed and
  nothing gets opened.
- **Non-breaking by default, breaking on your own schedule.** Every change in the pull request is
  labeled breaking or non-breaking based on the actual version jump, not just the mode you ran.

## Usage

Save this as `.github/workflows/update-dependencies.yml`. Runs every Monday at 02:00 UTC:

```yaml
name: Update Dependencies

on:
  schedule:
    - cron: '0 2 * * 1' # every Monday at 02:00 UTC
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: yanovian/update-dependencies-action@v1
        with:
          update-strategy: non-breaking
          create-pull-request: true
          github-token: ${{ secrets.PAT_TOKEN }}
```

This is the recommended setup: no `check-commands`, a PAT for `github-token` (see
[permissions and tokens](#permissions-and-tokens)), your repo's own pull request CI checks the
update once it's opened, same as any other pull request.

More examples, each in its own folder under [`examples/`](examples/):

- [`examples/breaking/`](examples/breaking/): the monthly breaking-updates workflow
- [`examples/with-check-commands/`](examples/with-check-commands/): the simpler `check-commands`
  + default-token alternative
- [`examples/pull-request-checks/`](examples/pull-request-checks/): the pull request CI workflow
  the recommended setup expects you to already have
- [`examples/with-config/`](examples/with-config/): skipping an ecosystem or a path with a config
  file
- [`examples/with-branch-name/`](examples/with-branch-name/): a custom `branch-name` prefix
  instead of the default

Don't trigger this Action itself on `pull_request`. See
[why in the FAQ](_docs/faq-and-limitations.md#can-i-trigger-this-on-pull_request).

## Supported package managers

| Ecosystem | Language | What it updates |
| --- | --- | --- |
| npm, Yarn, pnpm | JavaScript/TypeScript | package.json + lockfile |
| pip | Python | requirements.txt |
| Cargo | Rust | Cargo.toml + Cargo.lock |
| Go | Go | go.mod + go.sum |
| Maven | Java/JVM | pom.xml |
| Gradle | Java/JVM | version catalog or build.gradle(.kts) |
| Bundler | Ruby | Gemfile + Gemfile.lock |
| Composer | PHP | composer.json + composer.lock |
| NuGet | C#/.NET | *.csproj |

Every manifest in the repo gets updated, not just the ones at the root, so a monorepo with
several languages gets all of them in one run. Full detail on exactly which command runs for each
one, and what it deliberately won't touch: [`_docs/supported-package-managers.md`](_docs/supported-package-managers.md).

## What the pull request looks like

The pull request description lists, for every path in your repo where something changed: the
package, the path, the version it moved from and to, and whether that change was breaking or not.
It also lists every command that ran and passed, credits Update Dependencies, and explains why
keeping dependencies current matters for security while making clear that testing the change is
still on you.

Both the title and the body say what date the run happened on. Running it again the same day
updates that same pull request instead of opening a new one; a run on a later date opens a new
one, and if an earlier one from this Action is still open, the new pull request points to it and
recommends closing it. Full detail:
[does it create a new pull request every time it runs](_docs/faq-and-limitations.md#does-it-create-a-new-pull-request-every-time-it-runs).

## Permissions and tokens

Your workflow needs to grant these permissions either way:

```yaml
permissions:
  contents: write
  pull-requests: write
```

For `github-token`, there are two paths, explained in full in the
[FAQ](_docs/faq-and-limitations.md#check-commands-or-your-own-ci-which-should-i-use):

- **Recommended**: a PAT, so your repo's own pull request CI runs on the update automatically.
  [How to create one](_docs/faq-and-limitations.md#creating-the-pat).
- **Simpler, not recommended**: the default `GITHUB_TOKEN`, paired with `check-commands`.

## Docs

- [Configuration](_docs/configuration.md): every workflow input, output, and config file field.
- [Supported package managers](_docs/supported-package-managers.md): exactly what command runs
  for each ecosystem, in each mode.
- [FAQ and limitations](_docs/faq-and-limitations.md): what this Action won't do, and why.

## A note on trust

This Action runs whatever commands you give it and only opens a pull request if they all pass.
That's a real signal, but it's not a guarantee. Review the diff yourself before merging,
especially for a breaking update.

## Contributing

This project uses [pnpm](https://pnpm.io) and Node 24. See [`Makefile`](Makefile) for the
available dev commands (`make install`, `make test`, `make lint`, `make verify`, and so on). See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to add support for another package manager.
