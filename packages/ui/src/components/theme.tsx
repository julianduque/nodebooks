"use client";
import React from "react";

export type ThemeMode = "light" | "dark";

// Context to flow theme mode down when UiCard wraps DOM elements
export const UiThemeContext = React.createContext<ThemeMode>("light");

// Detect the current theme from the document root (set by app ThemeProvider)
export const detectThemeMode = (): ThemeMode => {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
};

// Subscribe to changes on the document root and keep theme in sync
export const useThemeMode = (initial?: ThemeMode): ThemeMode => {
  // Always start with a stable default to avoid hydration mismatches.
  // We sync to the real document theme after mount.
  const [mode, setMode] = React.useState<ThemeMode>(initial ?? "light");

  React.useEffect(() => {
    // Sync on mount in case initial was not provided
    setMode(detectThemeMode());

    if (
      typeof MutationObserver === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setMode(detectThemeMode());
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return mode;
};
