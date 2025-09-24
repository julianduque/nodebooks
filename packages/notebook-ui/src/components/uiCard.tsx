"use client";
import React from "react";
import { ThemeToggleOverlay, UiThemeContext, useLocalTheme } from "./theme";

export interface UiCardProps {
  className?: string;
  children: React.ReactNode;
}

export const UiCard: React.FC<UiCardProps> = ({ className, children }) => {
  const [mode, toggle] = useLocalTheme();
  type ThemeableProps = {
    themeMode?: "light" | "dark";
    showThemeToggle?: boolean;
  };
  return (
    <UiThemeContext.Provider value={mode}>
      <div
        className={`relative rounded-lg border p-3 pr-10 pb-9 ${
          mode === "light"
            ? "bg-white border-slate-200"
            : "bg-slate-900 border-slate-800"
        } ${className ?? ""}`}
        style={
          mode === "dark"
            ? ({
                "--foreground": "#e5e7eb",
                "--muted": "#1f2937",
                "--border": "#334155",
              } as React.CSSProperties & Record<`--${string}`, string>)
            : undefined
        }
      >
        <ThemeToggleOverlay mode={mode} onToggle={toggle} />
        {/* Inject theme only into composite components (not DOM elements) */}
        {React.isValidElement(children) && typeof children.type !== "string"
          ? React.cloneElement(
              children as React.ReactElement<Partial<ThemeableProps>>,
              {
                themeMode: mode,
                showThemeToggle: false,
              }
            )
          : children}
      </div>
    </UiThemeContext.Provider>
  );
};
