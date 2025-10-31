"use client";
import React from "react";
import type { UiButton } from "@nodebooks/notebook-schema";
import {
  useUiInteractionContext,
  type UiInteractionEvent,
} from "./interaction-context.js";
import { useComponentThemeMode } from "./utils.js";
import clsx from "clsx";

type ButtonVariant = NonNullable<UiButton["variant"]>;
type ButtonSize = NonNullable<UiButton["size"]>;

const baseButtonClasses =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  outline:
    "border border-input bg-background text-foreground shadow-sm hover:bg-muted/60",
  ghost: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
};

const sizeClasses = (size: ButtonSize): string => {
  switch (size) {
    case "sm":
      return "h-8 px-3 text-sm";
    case "lg":
      return "h-11 px-5 text-base";
    case "md":
    default:
      return "h-10 px-4 text-sm";
  }
};

export interface InteractiveButtonProps extends Omit<
  UiButton,
  "ui" | "action" | "variant" | "size"
> {
  action: UiButton["action"];
  className?: string;
  themeMode?: "light" | "dark";
  variant?: UiButton["variant"];
  size?: UiButton["size"];
}

export const InteractiveButton: React.FC<InteractiveButtonProps> = ({
  label,
  variant = "primary",
  size = "md",
  disabled,
  tooltip,
  busy,
  action,
  componentId,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const { onInteraction, displayId } = useUiInteractionContext();
  const [pending, setPending] = React.useState(false);

  const effectiveDisabled =
    disabled ||
    busy ||
    pending ||
    !action ||
    typeof action.handlerId !== "string" ||
    !onInteraction;

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (effectiveDisabled || !action || !onInteraction) {
      return;
    }
    const interaction: UiInteractionEvent = {
      handlerId: action.handlerId,
      event: action.event ?? "click",
      payload: undefined,
      componentId,
      displayId,
    };
    try {
      setPending(true);
      await Promise.resolve(onInteraction(interaction));
    } catch (err) {
      console.error("Failed to dispatch interaction", err);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      data-theme-mode={mode}
      className={clsx(
        baseButtonClasses,
        variantClasses[variant ?? "primary"] ?? variantClasses.primary,
        sizeClasses(size),
        className
      )}
      disabled={effectiveDisabled}
      title={tooltip}
      aria-busy={pending || busy ? "true" : "false"}
      onClick={handleClick}
    >
      {(pending || busy) && (
        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current/60 border-t-transparent" />
      )}
      <span>{label ?? "Action"}</span>
    </button>
  );
};
