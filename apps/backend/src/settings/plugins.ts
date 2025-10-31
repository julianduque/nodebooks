import type { SettingsStore } from "../types.js";
import { z } from "zod";

export const PluginInfoSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  installed: z.boolean().default(true),
});

export type PluginInfo = z.infer<typeof PluginInfoSchema>;

export interface PluginSettingsStore {
  getInstalledPlugins(): Promise<string[]>;
  setInstalledPlugins(plugins: string[]): Promise<void>;
  getPluginEnabled(pluginId: string): Promise<boolean>;
  setPluginEnabled(pluginId: string, enabled: boolean): Promise<void>;
}

/**
 * Plugin settings manager that stores plugin state in the settings store.
 */
export class PluginSettingsManager {
  private readonly STORAGE_KEY_INSTALLED = "plugins:installed";
  private readonly STORAGE_KEY_ENABLED_PREFIX = "plugins:enabled:";

  constructor(private readonly store: SettingsStore) {}

  /**
   * Get list of installed third-party plugin package names.
   */
  async getInstalledPlugins(): Promise<string[]> {
    const stored = await this.store.get(this.STORAGE_KEY_INSTALLED);
    if (!stored) {
      return [];
    }
    const parsed = z.array(z.string()).safeParse(stored);
    return parsed.success ? parsed.data : [];
  }

  /**
   * Set list of installed third-party plugin package names.
   */
  async setInstalledPlugins(plugins: string[]): Promise<void> {
    await this.store.set(this.STORAGE_KEY_INSTALLED, plugins);
  }

  /**
   * Add a plugin to the installed list.
   */
  async addInstalledPlugin(pluginId: string): Promise<void> {
    const installed = await this.getInstalledPlugins();
    if (!installed.includes(pluginId)) {
      installed.push(pluginId);
      await this.setInstalledPlugins(installed);
    }
  }

  /**
   * Remove a plugin from the installed list.
   */
  async removeInstalledPlugin(pluginId: string): Promise<void> {
    const installed = await this.getInstalledPlugins();
    const filtered = installed.filter((id) => id !== pluginId);
    await this.setInstalledPlugins(filtered);
    // Also disable the plugin
    await this.setPluginEnabled(pluginId, false);
  }

  /**
   * Check if a plugin is enabled.
   */
  async getPluginEnabled(pluginId: string): Promise<boolean> {
    const key = `${this.STORAGE_KEY_ENABLED_PREFIX}${pluginId}`;
    const stored = await this.store.get(key);
    if (stored === undefined || stored === null) {
      // Default to enabled if not set
      return true;
    }
    return Boolean(stored);
  }

  /**
   * Set whether a plugin is enabled.
   */
  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const key = `${this.STORAGE_KEY_ENABLED_PREFIX}${pluginId}`;
    await this.store.set(key, enabled);
  }

  /**
   * Get all plugin enabled states.
   */
  async getAllPluginStates(): Promise<Record<string, boolean>> {
    const all = await this.store.all();
    const states: Record<string, boolean> = {};
    const prefix = this.STORAGE_KEY_ENABLED_PREFIX;

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(prefix)) {
        const pluginId = key.slice(prefix.length);
        states[pluginId] = Boolean(value);
      }
    }

    return states;
  }
}
