import path from 'node:path';
import { parseXml } from '../../util/xml.js';
import type { ManifestLocation } from '../../types/ecosystem-plugin.js';

interface MavenDependency {
  readonly groupId?: string;
  readonly artifactId?: string;
  readonly version?: string;
}

interface PomShape {
  readonly project?: {
    readonly properties?: Record<string, unknown>;
    readonly dependencies?: { readonly dependency?: MavenDependency[] };
  };
}

export function detectMavenManifests(repoFiles: readonly string[]): ManifestLocation[] {
  return repoFiles
    .filter((filePath) => path.basename(filePath) === 'pom.xml')
    .map((manifestPath) => ({
      ecosystem: 'maven' as const,
      language: 'Java/JVM',
      manifestPath,
      directory: path.dirname(manifestPath),
    }));
}

function resolvePropertyReference(
  rawVersion: string,
  properties: ReadonlyMap<string, string>,
): string | null {
  const match = /^\$\{([^}]+)\}$/.exec(rawVersion);
  return match?.[1] ? (properties.get(match[1]) ?? null) : rawVersion;
}

function addResolvedVersion(
  resolved: Map<string, string>,
  dependency: MavenDependency,
  properties: ReadonlyMap<string, string>,
): void {
  if (!dependency.groupId || !dependency.artifactId || !dependency.version) {
    return;
  }
  const version = resolvePropertyReference(dependency.version, properties);
  if (version) {
    resolved.set(`${dependency.groupId}:${dependency.artifactId}`, version);
  }
}

/** Reads each declared dependency's effective version, resolving a `${property}` reference
 * against `<properties>` since versions-maven-plugin updates the property, not a literal
 * `<version>` tag, when a dependency's version is declared that way. */
export function readDependencyVersions(pomXml: string): Map<string, string> {
  const parsed = parseXml<PomShape>(pomXml, ['dependency']);
  const properties = new Map(
    Object.entries(parsed.project?.properties ?? {}).map(([key, value]) => [key, String(value)]),
  );

  const resolved = new Map<string, string>();
  for (const dependency of parsed.project?.dependencies?.dependency ?? []) {
    addResolvedVersion(resolved, dependency, properties);
  }
  return resolved;
}
