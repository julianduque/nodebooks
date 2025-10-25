"use client";
import React from "react";
import { UiThemeContext, type ThemeMode } from "./theme";
import { useComponentThemeMode } from "./utils";

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
        className={`relative p-2 rounded-lg bg-card text-card-foreground border-border ${className ?? ""}`}
      >
        {/* Inject theme only into composite components (not DOM elements) */}
        {React.isValidElement(children) && typeof children.type !== "string"
          ? React.cloneElement(
              children as React.ReactElement<Partial<ThemeableProps>>,
              {
                themeMode: mode,
              }
            )
          : children}
      </div>
    </UiThemeContext.Provider>
  );
};
