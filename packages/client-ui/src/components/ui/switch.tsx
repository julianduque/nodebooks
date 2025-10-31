"use client";

import { forwardRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "../../lib/utils.js";

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
          "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:ring-offset-background",
          checked ? "bg-primary/25" : "bg-muted",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
        aria-label={srLabel}
      >
        <span className="sr-only">{srLabel}</span>
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform duration-200 ease-in-out",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
