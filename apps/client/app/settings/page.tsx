"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AppShell from "@/components/app-shell";
import { cn } from "@/components/lib/utils";
import { useTheme, type ThemeMode } from "@/components/theme-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import LoadingOverlay from "@/components/ui/loading-overlay";

import { clientConfig } from "@nodebooks/config/client";
const API_BASE_URL = clientConfig().apiBaseUrl;

type AiProvider = "openai" | "heroku";

interface AiSettingsPayload {
  provider: AiProvider;
  openai: { model: string | null; apiKeyConfigured: boolean };
  heroku: {
    modelId: string | null;
    inferenceKeyConfigured: boolean;
    inferenceUrl: string | null;
  };
}

interface SettingsPayload {
  theme: ThemeMode;
  kernelTimeoutMs: number;
  aiEnabled: boolean;
  ai: AiSettingsPayload;
}

type SavingSection =
  | "theme"
  | "kernel"
  | "ai"
  | "aiEnabled"
  | null;
type FeedbackState = { type: "success" | "error"; message: string } | null;

const isTheme = (value: unknown): value is ThemeMode => {
  return value === "light" || value === "dark";
};

const isAiProvider = (value: unknown): value is AiProvider => {
  return value === "openai" || value === "heroku";
};

const parseAiSettings = (value: unknown): AiSettingsPayload => {
  if (!value || typeof value !== "object") {
    return {
      provider: "openai",
      openai: { model: null, apiKeyConfigured: false },
      heroku: {
        modelId: null,
        inferenceKeyConfigured: false,
        inferenceUrl: null,
      },
    };
  }
  const record = value as Record<string, unknown>;
  const provider = isAiProvider(record.provider) ? record.provider : "openai";
  const openai =
    record.openai && typeof record.openai === "object"
      ? (record.openai as Record<string, unknown>)
      : {};
  const heroku =
    record.heroku && typeof record.heroku === "object"
      ? (record.heroku as Record<string, unknown>)
      : {};
  const readString = (input: unknown): string | null =>
    typeof input === "string" && input.length > 0 ? input : null;
  const readBoolean = (input: unknown): boolean =>
    typeof input === "boolean" ? input : false;
  return {
    provider,
    openai: {
      model: readString(openai.model),
      apiKeyConfigured: readBoolean(openai.apiKeyConfigured),
    },
    heroku: {
      modelId: readString(heroku.modelId),
      inferenceKeyConfigured: readBoolean(heroku.inferenceKeyConfigured),
      inferenceUrl: readString(heroku.inferenceUrl),
    },
  };
};

const parseSettings = (value: unknown): SettingsPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isTheme(record.theme)) {
    return null;
  }
  if (typeof record.kernelTimeoutMs !== "number") {
    return null;
  }
  if (Number.isNaN(record.kernelTimeoutMs)) {
    return null;
  }
  const ai = parseAiSettings(record.ai);
  const aiEnabled =
    typeof record.aiEnabled === "boolean" ? record.aiEnabled : true;
  return {
    theme: record.theme,
    kernelTimeoutMs: record.kernelTimeoutMs,
    aiEnabled,
    ai,
  };
};

const ThemeSection = ({
  value,
  onChange,
  disabled,
}: {
  value: ThemeMode;
  onChange: (next: ThemeMode) => void;
  disabled: boolean;
}) => {
  const options: ThemeMode[] = ["light", "dark"];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Theme</h3>
        <p className="text-sm text-muted-foreground">
          Choose between a light or dark workspace experience.
        </p>
      </div>
      <div className="flex gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            onClick={() => onChange(option)}
            disabled={disabled}
            aria-pressed={value === option}
            className="min-w-[84px] capitalize"
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
};

const KernelSection = ({
  value,
  onChange,
  onSubmit,
  saving,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  saving: boolean;
}) => {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Kernel timeout
        </h3>
        <p className="text-sm text-muted-foreground">
          Configure the maximum execution time for notebook cells (1–10
          minutes).
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="number"
          inputMode="numeric"
          min={1000}
          max={600000}
          step={500}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-40"
          aria-label="Kernel timeout (ms)"
        />
        <Button type="button" onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : "Update"}
        </Button>
      </div>
    </div>
  );
};

const AiToggleButton = ({
  enabled,
  onToggle,
  disabled,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  disabled: boolean;
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors",
        enabled ? "bg-emerald-500/20" : "bg-muted",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
    >
      <span className="sr-only">Toggle AI assistant</span>
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
};

const AiEnabledSection = ({
  enabled,
  onToggle,
  saving,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  saving: boolean;
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">AI assistant</h3>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? "AI-powered generation is available in code and markdown cells."
            : "Turn on AI to enable generation actions in your notebooks."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "text-xs font-medium",
            enabled
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          )}
        >
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <AiToggleButton
          enabled={enabled}
          onToggle={onToggle}
          disabled={saving}
        />
      </div>
    </div>
  );
};

const AiSection = ({
  provider,
  onProviderChange,
  openaiModel,
  onOpenaiModelChange,
  openaiApiKey,
  onOpenaiApiKeyChange,
  openaiKeyConfigured,
  herokuModelId,
  onHerokuModelIdChange,
  herokuInferenceKey,
  onHerokuInferenceKeyChange,
  herokuInferenceUrl,
  onHerokuInferenceUrlChange,
  herokuKeyConfigured,
  onSave,
  saving,
}: {
  provider: AiProvider;
  onProviderChange: (value: AiProvider) => void;
  openaiModel: string;
  onOpenaiModelChange: (value: string) => void;
  openaiApiKey: string;
  onOpenaiApiKeyChange: (value: string) => void;
  openaiKeyConfigured: boolean;
  herokuModelId: string;
  onHerokuModelIdChange: (value: string) => void;
  herokuInferenceKey: string;
  onHerokuInferenceKeyChange: (value: string) => void;
  herokuInferenceUrl: string;
  onHerokuInferenceUrlChange: (value: string) => void;
  herokuKeyConfigured: boolean;
  onSave: () => void;
  saving: boolean;
}) => {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Update provider credentials used for AI-powered cell generation.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Provider
        </label>
        <select
          value={provider}
          onChange={(event) =>
            onProviderChange(event.target.value as AiProvider)
          }
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
          aria-label="AI provider"
        >
          <option value="openai">OpenAI</option>
          <option value="heroku">Heroku AI</option>
        </select>
      </div>
      {provider === "openai" ? (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Model
            <input
              type="text"
              value={openaiModel}
              onChange={(event) => onOpenaiModelChange(event.target.value)}
              placeholder="e.g. gpt-4o-mini"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            API key
            <input
              type="text"
              value={openaiApiKey}
              onChange={(event) => onOpenaiApiKeyChange(event.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {openaiKeyConfigured
              ? "An API key is already configured on the server. Enter the key again to update these settings."
              : "Keys are stored securely on the server. Enter your key to enable OpenAI."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Model ID
            <input
              type="text"
              value={herokuModelId}
              onChange={(event) => onHerokuModelIdChange(event.target.value)}
              placeholder="model-id"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Inference key
            <input
              type="text"
              value={herokuInferenceKey}
              onChange={(event) =>
                onHerokuInferenceKeyChange(event.target.value)
              }
              placeholder="heroku key"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Inference URL
            <input
              type="text"
              value={herokuInferenceUrl}
              onChange={(event) =>
                onHerokuInferenceUrlChange(event.target.value)
              }
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            The inference URL should point to your Heroku AI endpoint.
            {herokuKeyConfigured
              ? " Re-enter your inference key to update these settings."
              : ""}
          </p>
        </div>
      )}
      <div>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save AI settings"}
        </Button>
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const [themeValue, setThemeValue] = useState<ThemeMode>(theme);
  const [kernelTimeout, setKernelTimeout] = useState("10000");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [openaiModel, setOpenaiModel] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiKeyConfigured, setOpenaiKeyConfigured] = useState(false);
  const [herokuModelId, setHerokuModelId] = useState("");
  const [herokuInferenceKey, setHerokuInferenceKey] = useState("");
  const [herokuInferenceUrl, setHerokuInferenceUrl] = useState("");
  const [herokuKeyConfigured, setHerokuKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<SavingSection>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const parsed = parseSettings(payload?.data);
      if (!parsed) {
        throw new Error("Received malformed settings payload");
      }
      setTheme(parsed.theme);
      setThemeValue(parsed.theme);
      setKernelTimeout(String(parsed.kernelTimeoutMs));
      setAiEnabled(parsed.aiEnabled);
      setAiProvider(parsed.ai.provider);
      setOpenaiModel(parsed.ai.openai.model ?? "");
      setOpenaiKeyConfigured(parsed.ai.openai.apiKeyConfigured);
      setOpenaiApiKey("");
      setHerokuModelId(parsed.ai.heroku.modelId ?? "");
      setHerokuKeyConfigured(parsed.ai.heroku.inferenceKeyConfigured);
      setHerokuInferenceKey("");
      setHerokuInferenceUrl(parsed.ai.heroku.inferenceUrl ?? "");
      setFeedback(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load settings at this time.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const applyResponse = useCallback(
    (data: SettingsPayload) => {
      setTheme(data.theme);
      setThemeValue(data.theme);
      setKernelTimeout(String(data.kernelTimeoutMs));
      setAiEnabled(data.aiEnabled);
      setAiProvider(data.ai.provider);
      setOpenaiModel(data.ai.openai.model ?? "");
      setOpenaiKeyConfigured(data.ai.openai.apiKeyConfigured);
      setOpenaiApiKey("");
      setHerokuModelId(data.ai.heroku.modelId ?? "");
      setHerokuKeyConfigured(data.ai.heroku.inferenceKeyConfigured);
      setHerokuInferenceKey("");
      setHerokuInferenceUrl(data.ai.heroku.inferenceUrl ?? "");
    },
    [setTheme]
  );

  const handleThemeChange = useCallback(
    async (next: ThemeMode) => {
      if (savingSection === "theme" || next === themeValue) {
        return;
      }
      setSavingSection("theme");
      setFeedback(null);
      try {
        const response = await fetch(`${API_BASE_URL}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = await response.json();
        const parsed = parseSettings(payload?.data);
        if (!parsed) {
          throw new Error("Received malformed settings payload");
        }
        applyResponse(parsed);
        setFeedback({
          type: "success",
          message: `Switched to ${parsed.theme} mode.`,
        });
      } catch (err) {
        console.error(err);
        setFeedback({
          type: "error",
          message: "Unable to update the theme.",
        });
      } finally {
        setSavingSection(null);
      }
    },
    [applyResponse, savingSection, themeValue]
  );

  const handleKernelSubmit = useCallback(async () => {
    if (savingSection === "kernel") {
      return;
    }
    const parsed = Number.parseInt(kernelTimeout, 10);
    if (!Number.isFinite(parsed)) {
      setFeedback({
        type: "error",
        message: "Kernel timeout must be a number in milliseconds.",
      });
      return;
    }
    if (parsed < 1000 || parsed > 600_000) {
      setFeedback({
        type: "error",
        message: "Choose a timeout between 1,000 and 600,000 milliseconds.",
      });
      return;
    }
    setSavingSection("kernel");
    setFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kernelTimeoutMs: parsed }),
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const parsedSettings = parseSettings(payload?.data);
      if (!parsedSettings) {
        throw new Error("Received malformed settings payload");
      }
      applyResponse(parsedSettings);
      setFeedback({
        type: "success",
        message: "Kernel timeout updated.",
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: "error",
        message: "Unable to update the kernel timeout.",
      });
    } finally {
      setSavingSection(null);
    }
  }, [applyResponse, kernelTimeout, savingSection]);

  const handleAiSave = useCallback(async () => {
    if (savingSection === "ai") {
      return;
    }
    const provider = aiProvider;
    if (provider === "openai") {
      const model = openaiModel.trim();
      const apiKey = openaiApiKey.trim();
      if (!model) {
        setFeedback({
          type: "error",
          message: "Enter an OpenAI model before saving.",
        });
        return;
      }
      if (!apiKey) {
        setFeedback({
          type: "error",
          message: openaiKeyConfigured
            ? "Re-enter your OpenAI API key before saving."
            : "Enter your OpenAI API key before saving.",
        });
        return;
      }
    } else {
      const modelId = herokuModelId.trim();
      const inferenceKey = herokuInferenceKey.trim();
      const inferenceUrl = herokuInferenceUrl.trim();
      if (!modelId || !inferenceKey || !inferenceUrl) {
        setFeedback({
          type: "error",
          message: herokuKeyConfigured
            ? "Re-enter your Heroku inference key, model ID, and URL before saving."
            : "Fill out the Heroku model, key, and URL before saving.",
        });
        return;
      }
      try {
        const testUrl = new URL(inferenceUrl);
        void testUrl;
      } catch {
        setFeedback({
          type: "error",
          message: "Enter a valid Heroku inference URL.",
        });
        return;
      }
    }

    setSavingSection("ai");
    setFeedback(null);
    const payload: Record<string, unknown> = {
      ai:
        provider === "openai"
          ? {
              provider,
              openai: {
                model: openaiModel.trim(),
                apiKey: openaiApiKey.trim(),
              },
            }
          : {
              provider,
              heroku: {
                modelId: herokuModelId.trim(),
                inferenceKey: herokuInferenceKey.trim(),
                inferenceUrl: herokuInferenceUrl.trim(),
              },
            },
    };

    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const body = await response.json();
      const parsed = parseSettings(body?.data);
      if (!parsed) {
        throw new Error("Received malformed settings payload");
      }
      applyResponse(parsed);
      setFeedback({
        type: "success",
        message: "AI settings updated.",
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: "error",
        message: "Unable to update the AI settings.",
      });
    } finally {
      setSavingSection(null);
    }
  }, [
    aiProvider,
    applyResponse,
    herokuInferenceKey,
    herokuInferenceUrl,
    herokuKeyConfigured,
    herokuModelId,
    openaiApiKey,
    openaiKeyConfigured,
    openaiModel,
    savingSection,
  ]);

  const handleAiEnabledToggle = useCallback(
    async (next: boolean) => {
      if (savingSection === "aiEnabled" || next === aiEnabled) {
        return;
      }
      setSavingSection("aiEnabled");
      setFeedback(null);
      try {
        const response = await fetch(`${API_BASE_URL}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiEnabled: next }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const body = await response.json();
        const parsed = parseSettings(body?.data);
        if (!parsed) {
          throw new Error("Received malformed settings payload");
        }
        applyResponse(parsed);
        setFeedback({
          type: "success",
          message: next ? "AI assistant enabled." : "AI assistant disabled.",
        });
      } catch (err) {
        console.error(err);
        setFeedback({
          type: "error",
          message: "Unable to update AI availability.",
        });
      } finally {
        setSavingSection(null);
      }
    },
    [aiEnabled, applyResponse, savingSection]
  );

  const cardContent = useMemo(() => {
    if (loading) {
      return <LoadingOverlay label="Loading settings…" />;
    }

    if (error) {
      return (
        <Card className="mt-8 max-w-xl border-amber-300 bg-amber-50/80 dark:border-amber-500/60 dark:bg-amber-500/10">
          <CardContent className="space-y-4 px-6 py-6">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {error}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refresh();
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mt-8 w-full max-w-2xl">
        <CardContent className="space-y-6 px-6 py-6">
          {feedback && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                feedback.type === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-950/40 dark:text-rose-200"
              )}
              role="status"
            >
              {feedback.message}
            </div>
          )}
          <ThemeSection
            value={themeValue}
            onChange={handleThemeChange}
            disabled={savingSection === "theme"}
          />
          <Separator />
          <KernelSection
            value={kernelTimeout}
            onChange={setKernelTimeout}
            onSubmit={handleKernelSubmit}
            saving={savingSection === "kernel"}
          />
          <Separator />
          <AiEnabledSection
            enabled={aiEnabled}
            onToggle={(next) => {
              void handleAiEnabledToggle(next);
            }}
            saving={savingSection === "aiEnabled"}
          />
          {aiEnabled ? (
            <>
              <Separator />
              <AiSection
                provider={aiProvider}
                onProviderChange={setAiProvider}
                openaiModel={openaiModel}
                onOpenaiModelChange={setOpenaiModel}
                openaiApiKey={openaiApiKey}
                onOpenaiApiKeyChange={setOpenaiApiKey}
                openaiKeyConfigured={openaiKeyConfigured}
                herokuModelId={herokuModelId}
                onHerokuModelIdChange={setHerokuModelId}
                herokuInferenceKey={herokuInferenceKey}
                onHerokuInferenceKeyChange={setHerokuInferenceKey}
                herokuInferenceUrl={herokuInferenceUrl}
                onHerokuInferenceUrlChange={setHerokuInferenceUrl}
                herokuKeyConfigured={herokuKeyConfigured}
                onSave={handleAiSave}
                saving={savingSection === "ai"}
              />
              <Separator />
            </>
          ) : (
            <Separator />
          )}
        </CardContent>
      </Card>
    );
  }, [
    error,
    feedback,
    handleKernelSubmit,
    handleThemeChange,
    kernelTimeout,
    loading,
    refresh,
    savingSection,
    themeValue,
    aiEnabled,
    aiProvider,
    openaiModel,
    openaiApiKey,
    openaiKeyConfigured,
    herokuModelId,
    herokuInferenceKey,
    herokuInferenceUrl,
    herokuKeyConfigured,
    handleAiSave,
    handleAiEnabledToggle,
  ]);

  return (
    <AppShell title="Settings">
      <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
      <p className="mt-2 text-muted-foreground">
        Configure workspace preferences, appearance, and access.
      </p>
      {cardContent}
    </AppShell>
  );
};

export default SettingsPage;
