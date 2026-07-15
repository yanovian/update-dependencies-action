import type { DependencyUpdatePlugin } from '../types/ecosystem-plugin.js';
import { createCargoPlugin } from './cargo/cargo-plugin.js';
import { createComposerPlugin } from './composer/composer-plugin.js';
import { createGoPlugin } from './go/go-plugin.js';
import { createGradlePlugin } from './gradle/gradle-plugin.js';
import { createNpmPlugin } from './js/npm-plugin.js';
import { createPnpmPlugin } from './js/pnpm-plugin.js';
import { createYarnPlugin } from './js/yarn-plugin.js';
import { createMavenPlugin } from './maven/maven-plugin.js';
import { createNuGetPlugin } from './nuget/nuget-plugin.js';
import { createPipPlugin } from './pip/pip-plugin.js';
import { createRubyGemsPlugin } from './rubygems/rubygems-plugin.js';

/**
 * The single place a new ecosystem gets wired in. Adding support for another package manager
 * means writing one plugin module and adding one line here, nothing else in the pipeline needs
 * to change.
 */
export function createAllPlugins(): DependencyUpdatePlugin[] {
  return [
    createNpmPlugin(),
    createYarnPlugin(),
    createPnpmPlugin(),
    createPipPlugin(),
    createCargoPlugin(),
    createGoPlugin(),
    createMavenPlugin(),
    createGradlePlugin(),
    createRubyGemsPlugin(),
    createComposerPlugin(),
    createNuGetPlugin(),
  ];
}
