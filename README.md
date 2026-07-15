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

The recommended setup is two workflows: frequent non-breaking updates, and breaking updates on a
slower cadence so you have time to review them deliberately. `update-strategy: non-breaking` (the
default) keeps every package within its current major version, the same as running `npm update`
yourself. `update-strategy: breaking` allows major version jumps too, using each package
manager's real update tooling wherever one exists.

### Weekly non-breaking updates

Save this as `.github/workflows/update-dependencies-non-breaking.yml`. Runs every Monday at
02:00 UTC:

```yaml
name: Update Dependencies (non-breaking)

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
          check-commands: |
            - npm ci
            - npm test
            - npm run lint
          create-pull-request: true
          branch-name: update-dependencies/non-breaking
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Full copy: [`examples/workflows/update-dependencies-non-breaking.yml`](examples/workflows/update-dependencies-non-breaking.yml)

### Monthly breaking updates

Save this as `.github/workflows/update-dependencies-breaking.yml`. Runs at 03:00 UTC on the 1st
of every month. Cron can't reliably express "the first Monday of the month" in one line (a
day-of-month restriction and a day-of-week restriction get OR'd together, not AND'd, so it fires
more often than intended), so this uses a fixed calendar day instead:

```yaml
name: Update Dependencies (breaking)

on:
  schedule:
    - cron: '0 3 1 * *' # the 1st of every month at 03:00 UTC
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
          update-strategy: breaking
          check-commands: |
            - npm ci
            - npm test
            - npm run lint
          create-pull-request: true
          branch-name: update-dependencies/breaking
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Full copy: [`examples/workflows/update-dependencies-breaking.yml`](examples/workflows/update-dependencies-breaking.yml)

### More

- Every input: [`_docs/configuration.md`](_docs/configuration.md)
- Skip an ecosystem or a path: copy [`examples/update-dependencies.config.yml`](examples/update-dependencies.config.yml)
  into `.github/update-dependencies.yml` and edit it.

Don't trigger either workflow on `pull_request`. See
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
It also lists every command that ran and passed, and it says this pull request was opened by
Update Dependencies. It always tells you to still review and test the change yourself, since a
passing command is not a guarantee that nothing else changed.

Re-running the workflow doesn't open a new pull request every time. It pushes to the same branch
and updates the existing one.

## Permissions and tokens

You don't need to create a token yourself. The default `GITHUB_TOKEN` that GitHub Actions
provides works, as long as your workflow grants it permission to push a branch and open a pull
request:

```yaml
permissions:
  contents: write
  pull-requests: write
```

The example workflows above already include this. Without it, the Action can still update
dependencies and run your commands, it just can't push the branch or open the pull request.

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
