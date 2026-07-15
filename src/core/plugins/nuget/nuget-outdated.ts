import { runProcess } from '../../commands/run-process.js';

export interface OutdatedNuGetPackage {
  readonly id: string;
  readonly resolvedVersion: string;
  readonly latestVersion: string;
}

interface DotnetPackageEntry {
  readonly id?: string;
  readonly resolvedVersion?: string;
  readonly latestVersion?: string;
}

interface DotnetListOutput {
  readonly projects?: {
    readonly frameworks?: { readonly topLevelPackages?: DotnetPackageEntry[] }[];
  }[];
}

function addIfNew(outdated: Map<string, OutdatedNuGetPackage>, pkg: DotnetPackageEntry): void {
  if (pkg.id && pkg.resolvedVersion && pkg.latestVersion && !outdated.has(pkg.id)) {
    outdated.set(pkg.id, {
      id: pkg.id,
      resolvedVersion: pkg.resolvedVersion,
      latestVersion: pkg.latestVersion,
    });
  }
}

function collectFromProjects(
  outdated: Map<string, OutdatedNuGetPackage>,
  parsed: DotnetListOutput,
): void {
  const frameworks = (parsed.projects ?? []).flatMap((project) => project.frameworks ?? []);
  const packages = frameworks.flatMap((framework) => framework.topLevelPackages ?? []);
  for (const pkg of packages) {
    addIfNew(outdated, pkg);
  }
}

/** `dotnet list package --outdated` is the .NET SDK's own built-in outdated-package check, no
 * extra global tool required. A package can be listed once per target framework the project
 * multi-targets; the first occurrence is kept. */
export async function fetchOutdatedNuGetPackages(
  dir: string,
  projectFile: string,
): Promise<Map<string, OutdatedNuGetPackage>> {
  const result = await runProcess(`dotnet list "${projectFile}" package --outdated --format json`, {
    cwd: dir,
  });
  const parsed = JSON.parse(result.stdout) as DotnetListOutput;

  const outdated = new Map<string, OutdatedNuGetPackage>();
  collectFromProjects(outdated, parsed);
  return outdated;
}
