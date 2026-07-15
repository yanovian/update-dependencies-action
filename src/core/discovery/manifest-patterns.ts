/**
 * Filenames each ecosystem plugin looks for. Centralized here so a filename is never a
 * scattered magic string, and so the full breadth of what this Action supports is visible in
 * one place. `lockfile: null` means that ecosystem has no universal lockfile convention.
 */
export const MANIFEST_FILENAMES = {
  npm: { manifest: 'package.json', lockfile: 'package-lock.json' },
  yarn: { manifest: 'package.json', lockfile: 'yarn.lock' },
  pnpm: { manifest: 'package.json', lockfile: 'pnpm-lock.yaml' },
  pip: { manifest: 'requirements.txt', lockfile: null },
  cargo: { manifest: 'Cargo.toml', lockfile: 'Cargo.lock' },
  go: { manifest: 'go.mod', lockfile: 'go.sum' },
  maven: { manifest: 'pom.xml', lockfile: null },
  gradle: { manifest: 'build.gradle', lockfile: 'gradle.lockfile' },
  rubygems: { manifest: 'Gemfile', lockfile: 'Gemfile.lock' },
  composer: { manifest: 'composer.json', lockfile: 'composer.lock' },
  nuget: { manifest: '*.csproj', lockfile: 'packages.lock.json' },
} as const;
