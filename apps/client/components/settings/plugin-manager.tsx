"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Button,
  Switch,
  Separator,
  LoadingOverlay,
} from "@nodebooks/client-ui/components/ui";
import { pluginRegistry } from "@/lib/plugins";
import { cn } from "@nodebooks/client-ui/lib/utils";
import { Package, CheckCircle2, XCircle, Trash2, Loader2 } from "lucide-react";

interface PluginInfo {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  homepage?: string;
  enabled: boolean;
  official: boolean;
  cellTypes: Array<{
    type: string;
    name: string;
    enabled: boolean;
  }>;
}

interface PluginManagerProps {
  isAdmin: boolean;
}

const PluginManager = ({ isAdmin }: PluginManagerProps) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // const [installingPlugin, setInstallingPlugin] = useState<string | null>(
  //   null
  // );
  const [removingPlugin, setRemovingPlugin] = useState<string | null>(null);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/plugins");
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = (await response.json()) as {
        data: Array<{
          id: string;
          name: string;
          description?: string;
          version: string;
          author?: string;
          homepage?: string;
          enabled: boolean;
          official: boolean;
          cellTypes: Array<{
            type: string;
            name: string;
            enabled: boolean;
          }>;
        }>;
      };
      setPlugins(data.data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load plugins at this time.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  const handleTogglePlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      if (togglingPlugin === pluginId) {
        return;
      }
      setTogglingPlugin(pluginId);
      try {
        const response = await fetch(`/api/settings/plugins/enable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pluginId, enabled }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        // Refresh plugin list and sync registry
        await fetchPlugins();
        await pluginRegistry.syncWithBackend();
      } catch (err) {
        console.error("Failed to toggle plugin:", err);
        setError(
          err instanceof Error ? err.message : "Unable to toggle plugin"
        );
      } finally {
        setTogglingPlugin(null);
      }
    },
    [fetchPlugins, togglingPlugin]
  );

  // TODO: Implement plugin installation UI (npm package search)
  // const handleInstallPlugin = useCallback(
  //   async (packageName: string) => {
  //     if (installingPlugin) {
  //       return;
  //     }
  //     setInstallingPlugin(packageName);
  //     setError(null);
  //     try {
  //       const response = await fetch("/api/settings/plugins/install", {
  //         method: "POST",
  //         headers: { "Content-Type": "application/json" },
  //         body: JSON.stringify({ packageName }),
  //       });
  //       if (!response.ok) {
  //         const payload = (await response.json().catch(() => null)) as {
  //           error?: string;
  //         } | null;
  //         throw new Error(
  //           payload?.error ?? `Request failed with status ${response.status}`
  //         );
  //       }
  //       // Refresh plugin list
  //       await fetchPlugins();
  //       await pluginRegistry.syncWithBackend();
  //     } catch (err) {
  //       console.error("Failed to install plugin:", err);
  //       setError(
  //         err instanceof Error ? err.message : "Unable to install plugin"
  //       );
  //     } finally {
  //       setInstallingPlugin(null);
  //     }
  //   },
  //   [fetchPlugins, installingPlugin]
  // );

  const handleRemovePlugin = useCallback(
    async (packageName: string) => {
      if (removingPlugin === packageName) {
        return;
      }
      setRemovingPlugin(packageName);
      setError(null);
      try {
        const encodedPackageName = encodeURIComponent(packageName);
        const response = await fetch(
          `/api/settings/plugins/${encodedPackageName}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            payload?.error ?? `Request failed with status ${response.status}`
          );
        }
        // Refresh plugin list
        await fetchPlugins();
        await pluginRegistry.syncWithBackend();
      } catch (err) {
        console.error("Failed to remove plugin:", err);
        setError(
          err instanceof Error ? err.message : "Unable to remove plugin"
        );
      } finally {
        setRemovingPlugin(null);
      }
    },
    [fetchPlugins, removingPlugin]
  );

  if (loading) {
    return <LoadingOverlay label="Loading plugins…" />;
  }

  if (error) {
    return (
      <Card className="mt-4 border-amber-300 bg-amber-50/80 dark:border-amber-500/60 dark:bg-amber-500/10">
        <CardContent className="space-y-4 px-6 py-6">
          <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchPlugins()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const officialPlugins = plugins.filter((p) => p.official);
  const thirdPartyPlugins = plugins.filter((p) => !p.official);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Installed Plugins
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage cell type plugins. Official plugins are built-in and cannot be
          removed.
        </p>
      </div>

      {officialPlugins.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            Official Plugins
          </h3>
          {officialPlugins.map((plugin) => (
            <Card key={plugin.id} className="border-border">
              <CardContent className="space-y-4 px-6 py-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">
                        {plugin.name}
                      </h4>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        Built-in
                      </span>
                    </div>
                    {plugin.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plugin.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>v{plugin.version}</span>
                      {plugin.author && <span>by {plugin.author}</span>}
                      {plugin.homepage && (
                        <a
                          href={plugin.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Homepage
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        plugin.enabled
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {plugin.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={(checked) => {
                        void handleTogglePlugin(plugin.id, checked);
                      }}
                      disabled={togglingPlugin === plugin.id}
                      srLabel={`Enable/disable ${plugin.name}`}
                    />
                  </div>
                </div>
                {plugin.cellTypes && plugin.cellTypes.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Cell Types:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {plugin.cellTypes.map((cellType) => (
                          <span
                            key={cellType.type}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                              cellType.enabled
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {cellType.enabled ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {cellType.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {thirdPartyPlugins.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">
            Third-Party Plugins
          </h3>
          {thirdPartyPlugins.map((plugin) => (
            <Card key={plugin.id} className="border-border">
              <CardContent className="space-y-4 px-6 py-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">
                        {plugin.name}
                      </h4>
                    </div>
                    {plugin.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plugin.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>v{plugin.version}</span>
                      {plugin.author && <span>by {plugin.author}</span>}
                      {plugin.homepage && (
                        <a
                          href={plugin.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Homepage
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        plugin.enabled
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {plugin.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={(checked) => {
                        void handleTogglePlugin(plugin.id, checked);
                      }}
                      disabled={togglingPlugin === plugin.id}
                      srLabel={`Enable/disable ${plugin.name}`}
                    />
                    {isAdmin && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          void handleRemovePlugin(plugin.id);
                        }}
                        disabled={removingPlugin === plugin.id}
                      >
                        {removingPlugin === plugin.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {plugin.cellTypes && plugin.cellTypes.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Cell Types:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {plugin.cellTypes.map((cellType) => (
                          <span
                            key={cellType.type}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                              cellType.enabled
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {cellType.enabled ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {cellType.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {thirdPartyPlugins.length === 0 && officialPlugins.length > 0 && (
        <Card className="border-border">
          <CardContent className="px-6 py-6">
            <p className="text-sm text-muted-foreground">
              No third-party plugins installed. Install plugins from npm to add
              custom cell types.
            </p>
          </CardContent>
        </Card>
      )}

      {plugins.length === 0 && (
        <Card className="border-border">
          <CardContent className="px-6 py-6">
            <p className="text-sm text-muted-foreground">
              No plugins found. This is unexpected—please check your
              installation.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PluginManager;
