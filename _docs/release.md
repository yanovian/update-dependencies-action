# Release a new version

Run the matching release target:

```bash
make release-patch   # bug fixes
make release-minor   # new backwards-compatible features
make release-major   # breaking changes
```

Each one runs the full verification (`make verify`), commits a freshly built `dist/` if it
changed, bumps `package.json`'s version, commits that (`Release vX.Y.Z`), tags it, and pushes.
That's it. [`.github/workflows/release.yml`](../.github/workflows/release.yml) picks up the
pushed tag and:

- force-moves the major tag (for example `v1`) to point at the new release, so
  `uses: yanovian/update-dependencies-action@v1` keeps resolving to the latest release in
  that major series
- creates the GitHub Release, titled with the version, using GitHub's auto-generated notes
  (commits and pull requests since the last tag)
- GitHub Marketplace picks up the new release automatically, no manual step needed, except once
  (see below)

## One-time Marketplace setup

The first time this Action is ever published to the Marketplace, GitHub requires publishing a
release manually through the web UI so you can pick categories and accept the Marketplace
Developer Agreement. This can't be done through the API or `action.yml`. Use:

- Primary category: **Continuous Integration**
- Secondary category: **Utilities**

After that one-time setup, every release created by the `release.yml` workflow above
automatically updates the existing Marketplace listing. No need to repeat this.
