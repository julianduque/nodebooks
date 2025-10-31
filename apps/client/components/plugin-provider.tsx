"use client";

import { useEffect } from "react";
import { pluginRegistry } from "@/lib/plugins";

interface PluginProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes the plugin registry on mount.
 * This ensures plugins are loaded before any components try to use them.
 */
export function PluginProvider({ children }: PluginProviderProps) {
  useEffect(() => {
    void (async () => {
      try {
        await pluginRegistry.initialize();
        await pluginRegistry.syncWithBackend();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("Failed to initialize plugin registry:", error);
      }
    })();
  }, []);

  // Render children even during initialization
  // Components will handle missing plugins gracefully
  // But we ensure plugins are initialized before they're used
  return <>{children}</>;
}
