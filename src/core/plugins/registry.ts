import type { DependencyUpdatePlugin, EcosystemId } from '../types/ecosystem-plugin.js';

export interface PluginRegistry {
  register(plugin: DependencyUpdatePlugin): void;
  get(ecosystem: EcosystemId): DependencyUpdatePlugin;
  getAll(): readonly DependencyUpdatePlugin[];
}

/** Wires ecosystem id to plugin instance. The rest of the pipeline only ever talks to this. */
export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<EcosystemId, DependencyUpdatePlugin>();

  return {
    register(plugin: DependencyUpdatePlugin): void {
      plugins.set(plugin.id, plugin);
    },
    get(ecosystem: EcosystemId): DependencyUpdatePlugin {
      const plugin = plugins.get(ecosystem);
      if (!plugin) {
        throw new Error(`No plugin registered for ecosystem "${ecosystem}"`);
      }
      return plugin;
    },
    getAll(): readonly DependencyUpdatePlugin[] {
      return [...plugins.values()];
    },
  };
}
