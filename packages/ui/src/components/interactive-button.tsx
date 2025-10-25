"use client";
import React from "react";
import type { UiButton } from "@nodebooks/notebook-schema";
import {
  useUiInteractionContext,
  type UiInteractionEvent,
} from "./interaction-context";
import { useComponentThemeMode } from "./utils";

type ButtonVariant = NonNullable<UiButton["variant"]>;
type ButtonSize = NonNullable<UiButton["size"]>;

const variantClasses = (
  variant: ButtonVariant,
  mode: "light" | "dark"
): string => {
  const lightVariants: Record<ButtonVariant, string> = {
    primary:
      "bg-sky-600 text-white hover:bg-sky-500 active:bg-sky-600/90 focus-visible:ring-offset-white",
    secondary:
      "bg-white text-slate-900 border border-slate-300 hover:border-slate-400 hover:bg-slate-100 focus-visible:ring-offset-white",
    outline:
      "border border-slate-300 text-slate-900 hover:bg-slate-100 focus-visible:ring-offset-white",
    ghost: "text-slate-900 hover:bg-slate-100 focus-visible:ring-offset-white",
  };
  const darkVariants: Record<ButtonVariant, string> = {
    primary:
      "bg-sky-500 text-white hover:bg-sky-400 active:bg-sky-500/90 focus-visible:ring-offset-slate-900",
    secondary:
      "bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 focus-visible:ring-offset-slate-900",
    outline:
      "border border-slate-600 text-slate-100 hover:bg-slate-700 hover:text-white focus-visible:ring-offset-slate-900",
    ghost:
      "text-slate-200 hover:bg-slate-700 focus-visible:ring-offset-slate-900",
  };
  return mode === "dark"
    ? (darkVariants[variant] ?? darkVariants.primary)
    : (lightVariants[variant] ?? lightVariants.primary);
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

export interface InteractiveButtonProps
  extends Omit<UiButton, "ui" | "action" | "variant" | "size"> {
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${variantClasses(
        variant,
        mode
      )} ${sizeClasses(size)} ${className ?? ""} disabled:cursor-not-allowed disabled:opacity-55`}
      disabled={effectiveDisabled}
      title={tooltip}
      aria-busy={pending || busy ? "true" : "false"}
      onClick={handleClick}
    >
      {(pending || busy) && (
        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      )}
      <span>{label ?? "Action"}</span>
    </button>
  );
};
