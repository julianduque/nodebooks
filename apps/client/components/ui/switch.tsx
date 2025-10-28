"use client";

import { forwardRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  srLabel?: string;
};

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onCheckedChange,
      disabled = false,
      className,
      srLabel = "Toggle",
    },
    ref
  ) => {
    const toggle = () => {
      if (disabled) return;
      onCheckedChange(!checked);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggle();
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors",
          checked ? "bg-emerald-500/20" : "bg-muted",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
        aria-label={srLabel}
      >
        <span className="sr-only">{srLabel}</span>
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
