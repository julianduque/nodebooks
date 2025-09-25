"use client";
import React from "react";
import { UiThemeContext, useThemeMode } from "./theme";
import type { ThemeMode } from "./theme";

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
  const detected = useThemeMode();
  const mode: ThemeMode = themeMode ?? detected;
  type ThemeableProps = {
    themeMode?: "light" | "dark";
  };
  return (
    <UiThemeContext.Provider value={mode}>
      <div
        className={`relative rounded-lg bg-card text-card-foreground border-border ${className ?? ""}`}
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
