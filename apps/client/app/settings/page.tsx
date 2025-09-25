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

interface SettingsPayload {
  theme: ThemeMode;
  kernelTimeoutMs: number;
  passwordEnabled: boolean;
}

type SavingSection = "theme" | "kernel" | "password" | null;
type FeedbackState = { type: "success" | "error"; message: string } | null;

const isTheme = (value: unknown): value is ThemeMode => {
  return value === "light" || value === "dark";
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
  if (typeof record.passwordEnabled !== "boolean") {
    return null;
  }
  return {
    theme: record.theme,
    kernelTimeoutMs: record.kernelTimeoutMs,
    passwordEnabled: record.passwordEnabled,
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

const PasswordSection = ({
  enabled,
  password,
  onPasswordChange,
  onSave,
  onDisable,
  saving,
}: {
  enabled: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  onSave: () => void;
  onDisable: () => void;
  saving: boolean;
}) => {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          NodeBooks password
        </h3>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? "Password protection is enabled for this workspace."
            : "Set a password to require authentication before accessing notebooks."}
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
          placeholder="Enter a new password"
          aria-label="NodeBooks password"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onSave}
            disabled={saving || password.length === 0}
          >
            {saving ? "Saving…" : enabled ? "Update" : "Enable"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDisable}
            disabled={saving || !enabled}
            className={cn(
              "border-destructive text-destructive hover:bg-destructive/10",
              "dark:border-destructive/70 dark:text-destructive"
            )}
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const [themeValue, setThemeValue] = useState<ThemeMode>(theme);
  const [kernelTimeout, setKernelTimeout] = useState("10000");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
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
      setPasswordEnabled(parsed.passwordEnabled);
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
      setPasswordEnabled(data.passwordEnabled);
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

  const handlePasswordSave = useCallback(async () => {
    if (savingSection === "password") {
      return;
    }
    if (passwordDraft.trim().length === 0) {
      setFeedback({
        type: "error",
        message: "Enter a password before saving.",
      });
      return;
    }
    setSavingSection("password");
    setFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordDraft }),
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
      setPasswordDraft("");
      setFeedback({
        type: "success",
        message: "Password updated successfully.",
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: "error",
        message: "Unable to update the password.",
      });
    } finally {
      setSavingSection(null);
    }
  }, [applyResponse, passwordDraft, savingSection]);

  const handlePasswordDisable = useCallback(async () => {
    if (savingSection === "password" || !passwordEnabled) {
      return;
    }
    setSavingSection("password");
    setFeedback(null);
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: null }),
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
      setPasswordDraft("");
      setFeedback({
        type: "success",
        message: "Password protection disabled.",
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: "error",
        message: "Unable to disable the password.",
      });
    } finally {
      setSavingSection(null);
    }
  }, [applyResponse, passwordEnabled, savingSection]);

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
          <PasswordSection
            enabled={passwordEnabled}
            password={passwordDraft}
            onPasswordChange={setPasswordDraft}
            onSave={handlePasswordSave}
            onDisable={handlePasswordDisable}
            saving={savingSection === "password"}
          />
        </CardContent>
      </Card>
    );
  }, [
    error,
    feedback,
    handleKernelSubmit,
    handlePasswordDisable,
    handlePasswordSave,
    handleThemeChange,
    kernelTimeout,
    loading,
    passwordDraft,
    passwordEnabled,
    refresh,
    savingSection,
    themeValue,
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
