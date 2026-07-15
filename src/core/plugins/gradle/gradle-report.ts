import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../commands/run-process.js';
import { readFileIfPresent } from '../../util/read-file-if-present.js';
import {
  GRADLE_REPORT_FILENAME,
  GRADLE_REPORT_OUTPUT_DIR,
  writeGradleInitScript,
} from './gradle-init-script.js';

export interface OutdatedGradleDependency {
  readonly groupArtifact: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
}

interface BenManesDependency {
  readonly group?: string;
  readonly name?: string;
  readonly version?: string;
  readonly available?: { readonly release?: string | null };
}

interface BenManesReport {
  readonly outdated?: { readonly dependencies?: readonly BenManesDependency[] };
}

export async function resolveGradleCommand(dir: string): Promise<string> {
  const wrapperContents = await readFileIfPresent(path.join(dir, 'gradlew'));
  return wrapperContents !== null ? './gradlew' : 'gradle';
}

/** Runs the ben-manes `dependencyUpdates` task and returns every dependency it found a newer
 * release for. This never modifies build files itself, it only reports. */
export async function fetchOutdatedGradleDependencies(
  dir: string,
): Promise<OutdatedGradleDependency[]> {
  const gradleCommand = await resolveGradleCommand(dir);
  const initScriptPath = await writeGradleInitScript();
  const command = `${gradleCommand} --init-script "${initScriptPath}" dependencyUpdates -Drevision=release --console=plain -q`;

  await runProcess(command, { cwd: dir });

  const reportPath = path.join(dir, GRADLE_REPORT_OUTPUT_DIR, GRADLE_REPORT_FILENAME);
  const reportJson = await readFile(reportPath, 'utf8');
  return parseDependencyUpdatesReport(reportJson);
}

export function parseDependencyUpdatesReport(reportJson: string): OutdatedGradleDependency[] {
  const report = JSON.parse(reportJson) as BenManesReport;
  const result: OutdatedGradleDependency[] = [];

  for (const dependency of report.outdated?.dependencies ?? []) {
    const latestVersion = dependency.available?.release;
    if (dependency.group && dependency.name && dependency.version && latestVersion) {
      result.push({
        groupArtifact: `${dependency.group}:${dependency.name}`,
        currentVersion: dependency.version,
        latestVersion,
      });
    }
  }
  return result;
}
