"use client";
import React from "react";
import { UiThemeContext, type ThemeMode } from "./theme.js";
import { useComponentThemeMode } from "./utils.js";

export interface UiCardProps {
  className?: string;
  children: React.ReactNode;
  themeMode?: ThemeMode;
}

export const UiCard: React.FC<UiCardProps> = ({
  className,
  children,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  type ThemeableProps = {
    themeMode?: "light" | "dark";
  };
  return (
    <UiThemeContext.Provider value={mode}>
      <div
        data-theme-mode={mode}
        className={`relative rounded-lg border border-border bg-card p-2 text-card-foreground shadow-sm ${className ?? ""}`}
      >
        {/* Inject theme only into composite components (not DOM elements) */}
        {React.Children.map(children, (child) =>
          React.isValidElement(child) && typeof child.type !== "string"
            ? React.cloneElement(
                child as React.ReactElement<Partial<ThemeableProps>>,
                {
                  themeMode: mode,
                }
              )
            : child
        )}
      </div>
    </UiThemeContext.Provider>
  );
};
