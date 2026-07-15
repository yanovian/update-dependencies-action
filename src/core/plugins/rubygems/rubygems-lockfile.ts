/** Gemfile.lock lists every resolved gem (direct and transitive) at 4-space indent under each
 * source's "specs:" section; a gem's own transitive dependencies are listed under it at deeper
 * indent, so requiring exactly 4 leading spaces excludes those. */
export function parseGemfileLockSpecs(contents: string): Map<string, string> {
  const specs = new Map<string, string>();
  let inSpecs = false;

  for (const line of contents.split('\n')) {
    if (/^\s*specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }
    if (!inSpecs) {
      continue;
    }
    if (line.trim() === '' || /^\S/.test(line)) {
      inSpecs = false;
      continue;
    }
    const match = /^ {4}(\S+) \(([^)]+)\)$/.exec(line);
    if (match?.[1] && match[2]) {
      specs.set(match[1], match[2]);
    }
  }

  return specs;
}

/** The DEPENDENCIES section lists exactly the gems declared directly in the Gemfile, each at
 * 2-space indent, optionally followed by a version constraint or a trailing "!" marking a
 * git/path source. */
export function parseGemfileLockDependencyNames(contents: string): string[] {
  const names: string[] = [];
  let inDependencies = false;

  for (const line of contents.split('\n')) {
    if (/^DEPENDENCIES\s*$/.test(line)) {
      inDependencies = true;
      continue;
    }
    if (!inDependencies) {
      continue;
    }
    if (/^\S/.test(line)) {
      inDependencies = false;
      continue;
    }
    const match = /^ {2}(\S+)/.exec(line);
    if (match?.[1]) {
      names.push(match[1].replace(/!$/, ''));
    }
  }

  return names;
}

export function resolveGemfileLockVersions(contents: string): Map<string, string> {
  const specs = parseGemfileLockSpecs(contents);
  const declared = parseGemfileLockDependencyNames(contents);
  const resolved = new Map<string, string>();
  for (const name of declared) {
    const version = specs.get(name);
    if (version) {
      resolved.set(name, version);
    }
  }
  return resolved;
}
