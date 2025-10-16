"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type ThemeValue = "light" | "dark" | "system";

const themeOptions: Array<{
  value: ThemeValue;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme, systemTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = useMemo<ThemeValue>(() => {
    if (theme === "system") {
      return systemTheme === "dark" ? "dark" : "light";
    }
    return (theme ?? "system") as ThemeValue;
  }, [theme, systemTheme]);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1 rounded-full border border-border p-1">
        {themeOptions.map(({ value }) => (
          <span key={value} className="h-9 w-9 rounded-lg bg-muted/40" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-1">
      {themeOptions.map(({ value, label, icon: Icon }) => {
        const isActive =
          value === "system" ? theme === "system" : activeTheme === value && theme !== "system";
        return (
          <Button
            key={value}
            variant={isActive ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9"
            aria-pressed={isActive}
            aria-label={`Use ${label.toLowerCase()} theme`}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
