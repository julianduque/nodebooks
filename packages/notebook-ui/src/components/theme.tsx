"use client";
import React from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeMode = "light" | "dark";

// Context to flow theme mode down when UiCard wraps DOM elements
export const UiThemeContext = React.createContext<ThemeMode>("light");

export const useLocalTheme = (
  initial: ThemeMode = "light"
): [ThemeMode, () => void] => {
  const [mode, setMode] = React.useState<ThemeMode>(initial);
  const toggle = React.useCallback(() => {
    setMode((m) => (m === "light" ? "dark" : "light"));
  }, []);
  return [mode, toggle];
};

export const ThemeToggleOverlay: React.FC<{
  mode: ThemeMode;
  onToggle: () => void;
}> = ({ mode, onToggle }) => {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-start justify-end p-2">
      <button
        type="button"
        title={mode === "light" ? "Switch to dark" : "Switch to light"}
        onClick={onToggle}
        aria-pressed={mode === "dark"}
        className={`pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-[0] transition-colors focus:outline-none ${
          mode === "light"
            ? "bg-white/70 text-slate-700 border-slate-200 hover:bg-slate-100"
            : "bg-slate-800/70 text-slate-200 border-slate-700 hover:bg-slate-900"
        }`}
      >
        {mode === "light" ? (
          <Moon size={14} className="opacity-80" />
        ) : (
          <Sun size={14} className="opacity-80" />
        )}
      </button>
    </div>
  );
};
