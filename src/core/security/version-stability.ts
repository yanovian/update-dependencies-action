import type { EcosystemId } from '../types/ecosystem-plugin.js';

/**
 * Words that mark a version as not a stable release in any ecosystem, matched case-insensitively
 * against each run of letters in the version ("2.0.0-beta.1", "1.0.0-SNAPSHOT", "5.0.0-RC2",
 * "1.0.dev3", ...). Whole letter runs, not substrings, so a stable qualifier that merely contains
 * one of these ("express" contains "pre") isn't mistaken for one.
 */
export const UNSTABLE_VERSION_WORDS = [
  'alpha',
  'beta',
  'rc',
  'pre',
  'prerelease',
  'preview',
  'dev',
  'snapshot',
  'canary',
  'nightly',
  'next',
  'unstable',
  'experimental',
  'insiders',
  'milestone',
] as const;

/** Returns the part of `version` that makes it a pre-release by that ecosystem's own rules, or
 * null. Catches what the shared word list can't: a tag with none of those words in it. */
type PrereleaseRule = (version: string) => string | null;

// SemVer: anything after a "-" in the version core is a pre-release tag ("1.0.0-0", "1.0.0-ci.5");
// build metadata after "+" is not.
const SEMVER_PRERELEASE = /^v?\d+(?:\.\d+)*-([^+]+)/;

const semverRule: PrereleaseRule = (version) => SEMVER_PRERELEASE.exec(version)?.[1] ?? null;

// Go pseudo-versions ("v0.0.0-20240101120000-abcdef123456", "v1.2.4-0.20240101120000-abcdef123456")
// identify a commit of a module with no newer tag. They are technically SemVer pre-releases, but
// for an untagged module they are the only versions there are, so treating them as unstable would
// freeze that dependency for good. A pseudo-version based on an actual pre-release tag
// ("v1.2.4-beta.1.0.2024...") is still caught by the word list.
const GO_PSEUDO_VERSION = /-(?:0\.)?\d{14}-[0-9a-f]{12}$/;

const goRule: PrereleaseRule = (version) =>
  GO_PSEUDO_VERSION.test(version) ? null : semverRule(version);

// PEP 440: a, b, c, and rc right after the release segment ("1.0a1", "1.0b2", "1.0c1", "1.0rc1"),
// and dev releases ("1.0.dev3"). ".postN" releases are stable.
const PEP440_PRERELEASE = /^v?\d+(?:\.\d+)*[-_.]?(a|b|c|rc)[-_.]?\d*(?![a-z])/i;

const pipRule: PrereleaseRule = (version) => PEP440_PRERELEASE.exec(version)?.[1] ?? null;

// RubyGems: any letter makes a version a pre-release ("1.0.0.pre", "2.0.0.a").
const rubygemsRule: PrereleaseRule = (version) => /[a-z]+/i.exec(version)?.[0] ?? null;

// Maven's ComparableVersion: "a1", "b1", "m1" are alpha, beta, milestone; "cr" is a release
// candidate (JBoss/Hibernate); "ea" is early access. "ga", "final", "release", "sp", and
// arbitrary qualifiers like "jre" or "android" are stable.
const MAVEN_PRERELEASE = /(?:^|[.-])((?:a|b|m)\d+|cr\d*|ea)(?=$|[.-])/i;

const mavenRule: PrereleaseRule = (version) => MAVEN_PRERELEASE.exec(version)?.[1] ?? null;

// Composer: the stability flags are dev, alpha (a), beta (b), and RC; "patch"/"pl"/"p" are stable.
const COMPOSER_PRERELEASE = /[.-]((?:a|b)\d*)$/i;

const composerRule: PrereleaseRule = (version) => COMPOSER_PRERELEASE.exec(version)?.[1] ?? null;

const PRERELEASE_RULES: Record<EcosystemId, PrereleaseRule> = {
  npm: semverRule,
  yarn: semverRule,
  pnpm: semverRule,
  cargo: semverRule,
  nuget: semverRule,
  go: goRule,
  pip: pipRule,
  rubygems: rubygemsRule,
  maven: mavenRule,
  gradle: mavenRule,
  composer: composerRule,
};

/** The first marker that makes `version` unstable, for explaining why it was skipped, or null
 * when the version is a stable release. */
export function findUnstableMarker(ecosystem: EcosystemId, version: string): string | null {
  const letterRuns: readonly string[] = version.toLowerCase().match(/[a-z]+/g) ?? [];
  const word = UNSTABLE_VERSION_WORDS.find((candidate) => letterRuns.includes(candidate));
  return word ?? PRERELEASE_RULES[ecosystem](version);
}

export function isUnstableVersion(ecosystem: EcosystemId, version: string): boolean {
  return findUnstableMarker(ecosystem, version) !== null;
}

/** Every version in `versions` that isn't a stable release, for ruling them out as candidates. */
export function unstableVersionsOf(
  ecosystem: EcosystemId,
  versions: Iterable<string>,
): Set<string> {
  return new Set([...versions].filter((version) => isUnstableVersion(ecosystem, version)));
}
