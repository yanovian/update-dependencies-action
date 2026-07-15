import { writeTempFile } from '../../util/write-temp-file.js';

export const GRADLE_REPORT_OUTPUT_DIR = 'build/dependencyUpdatesReport';
export const GRADLE_REPORT_FILENAME = 'report.json';

/**
 * Applies the ben-manes gradle-versions-plugin cross-cuttingly via `--init-script`, so it runs
 * without the repo's own build files needing to declare it. Init scripts are always plain
 * Groovy regardless of whether the target project uses the Groovy or Kotlin build DSL.
 */
const INIT_SCRIPT_TEMPLATE = `
initscript {
    repositories { gradlePluginPortal() }
    dependencies { classpath 'com.github.ben-manes:gradle-versions-plugin:0.51.0' }
}

allprojects {
    apply plugin: com.github.benmanes.gradle.versions.VersionsPlugin
    if (project == rootProject) {
        tasks.matching { it.name == 'dependencyUpdates' }.configureEach {
            outputFormatter = 'json'
            outputDir = "\${rootProject.buildDir}/dependencyUpdatesReport"
            reportfileName = 'report'
        }
    }
}
`;

export async function writeGradleInitScript(): Promise<string> {
  return writeTempFile('update-dependencies-gradle-', 'init.gradle', INIT_SCRIPT_TEMPLATE);
}
