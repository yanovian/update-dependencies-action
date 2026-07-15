# Supported package managers

This Action scans your whole repo, not just the root. Every manifest it finds, in every
directory, gets checked, so a monorepo with a JavaScript frontend and a Go backend gets both
updated in the same run. Each row below shows exactly which command runs for each mode.

Every command runs from the directory the manifest was found in, except Gradle, which always
runs from the directory holding `settings.gradle(.kts)`, the same way you would run it yourself.

| Ecosystem | Language | Manifest | Non-breaking | Breaking |
| --- | --- | --- | --- | --- |
| npm | JavaScript/TypeScript | package.json + package-lock.json | `npm update` | `npm-check-updates -u --target latest` then `npm install` |
| Yarn (classic and Berry) | JavaScript/TypeScript | package.json + yarn.lock | `yarn upgrade` | `yarn upgrade --latest` |
| pnpm | JavaScript/TypeScript | package.json + pnpm-lock.yaml | `pnpm update` | `pnpm update --latest` |
| pip | Python | requirements.txt | rewrites `pkg==X.Y.Z` pins to the latest release within the same major version | rewrites to the latest release, any major |
| Cargo | Rust | Cargo.toml + Cargo.lock | `cargo update` | looks up each crate's latest version on crates.io, rewrites Cargo.toml, then `cargo update` |
| Go | Go | go.mod + go.sum | `go get -u ./...` then `go mod tidy` | same. See the note on major versions below. |
| Maven | Java/JVM | pom.xml | `versions-maven-plugin:use-latest-releases` with `-DallowMajorUpdates=false` | same with `-DallowMajorUpdates=true` |
| Gradle | Java/JVM | gradle/libs.versions.toml, or build.gradle(.kts) | discovers updates with the `gradle-versions-plugin`, then rewrites the version catalog or build file directly | same, no same-major filter |
| RubyGems (Bundler) | Ruby | Gemfile + Gemfile.lock | `bundle update --conservative --patch --minor` | `bundle update` |
| Composer | PHP | composer.json + composer.lock | `composer update --with-all-dependencies` | looks up each package's latest version, then `composer require pkg:^latest` |
| NuGet | C#/.NET | *.csproj | `dotnet list package --outdated`, then `dotnet add package <id> --version <v>` for each package within the same major | same, any major |

Where a package manager has its own real update command, this Action always uses it. It never
hand-edits a lockfile. The only files it rewrites directly are plain manifest files with no
command of their own for this (requirements.txt, Cargo.toml for a major bump, a Gradle version
catalog or build file), and even then only in a form it can confidently recognize. Anything it
finds but chooses not to touch is called out in the pull request instead of being guessed at.

## What "non-breaking" and "breaking" mean here

Non-breaking means the update stays within the current major version of a package. Breaking
means it can also cross into a new major version. This Action decides breaking or non-breaking
per package by comparing the actual version numbers, not by trusting the mode alone, so a
breaking run that only finds minor updates still reports them as non-breaking in the pull
request.

## Two things this Action will not do for you

**Go major versions.** Go encodes the major version in the module's import path (for example
`github.com/foo/bar/v2`). Moving to a new major means changing that import path everywhere it's
used in your source, which is a code change, not a dependency bump. This Action checks the Go
module proxy for a newer major and tells you about it in the pull request, but it will not
rewrite your imports for you.

**Runners need the right toolchain installed.** This Action shells out to each package manager's
own CLI (`npm`, `cargo`, `mvn`, `dotnet`, and so on). GitHub-hosted `ubuntu-latest` runners come
with all of these preinstalled, so the common case needs no extra setup. If you run this on a
self-hosted runner or a custom container image, make sure the toolchains for the ecosystems you
want updated are on the `PATH`.
