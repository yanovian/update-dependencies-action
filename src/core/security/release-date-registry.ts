import { fetchComposerVersionDates } from '../plugins/composer/packagist-client.js';
import { fetchCrateVersionDates } from '../plugins/cargo/crates-io-client.js';
import { fetchGoModuleVersionDates } from '../plugins/go/go-proxy-client.js';
import { fetchNpmVersionDates } from '../plugins/js/npm-registry-client.js';
import { fetchMavenVersionDates } from '../plugins/maven/maven-central-client.js';
import { fetchNuGetVersionDates } from '../plugins/nuget/nuget-client.js';
import { fetchPypiVersionDates } from '../plugins/pip/pypi-client.js';
import { fetchRubyGemVersionDates } from '../plugins/rubygems/rubygems-client.js';
import type { EcosystemId } from '../types/ecosystem-plugin.js';

/** Every version of a package the registry knows about, mapped to its publish date. Null means
 * the lookup itself failed (network error, retry budget exhausted, registry error) so the caller
 * can fail open rather than mistake "couldn't check" for "nothing published". */
export type VersionDateLookup = (name: string) => Promise<Map<string, Date> | null>;

/**
 * One lookup per ecosystem's registry, colocated with that ecosystem's other registry client
 * code (see e.g. `plugins/cargo/crates-io-client.ts`). npm, yarn, and pnpm share npm's registry;
 * Maven and Gradle both resolve against Maven Central and use the same "groupId:artifactId" key.
 */
const VERSION_DATE_LOOKUPS: Record<EcosystemId, VersionDateLookup> = {
  npm: fetchNpmVersionDates,
  yarn: fetchNpmVersionDates,
  pnpm: fetchNpmVersionDates,
  pip: fetchPypiVersionDates,
  cargo: fetchCrateVersionDates,
  go: fetchGoModuleVersionDates,
  maven: fetchMavenVersionDates,
  gradle: fetchMavenVersionDates,
  rubygems: fetchRubyGemVersionDates,
  composer: fetchComposerVersionDates,
  nuget: fetchNuGetVersionDates,
};

export function getVersionDates(
  ecosystem: EcosystemId,
  name: string,
): Promise<Map<string, Date> | null> {
  return VERSION_DATE_LOOKUPS[ecosystem](name);
}
