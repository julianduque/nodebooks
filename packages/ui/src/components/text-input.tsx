"use client";
import React from "react";
import type { UiTextInput } from "@nodebooks/notebook-schema";
import { useUiInteractionContext } from "./interaction-context";
import { useComponentThemeMode } from "./utils";

export interface TextInputProps
  extends Omit<UiTextInput, "ui" | "componentId"> {
  componentId?: string;
  className?: string;
  themeMode?: "light" | "dark";
}

export const InteractiveTextInput: React.FC<TextInputProps> = ({
  label,
  description,
  value,
  defaultValue,
  placeholder,
  disabled,
  multiline,
  rows = 3,
  onChange,
  onSubmit,
  componentId,
  className,
  themeMode,
}) => {
  const { onInteraction, displayId } = useUiInteractionContext();
  const mode = useComponentThemeMode(themeMode);
  const effectiveDisabled = disabled || !onInteraction;
  const [current, setCurrent] = React.useState<string>(
    typeof value === "string"
      ? value
      : typeof defaultValue === "string"
        ? defaultValue
        : ""
  );
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (typeof value === "string") {
      setCurrent(value);
    }
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const dispatchEvent = React.useCallback(
    (
      action: UiTextInput["onChange"] | UiTextInput["onSubmit"],
      nextValue: string,
      fallbackEvent: string
    ) => {
      if (!action || !onInteraction || typeof action !== "object") return;
      if (typeof action.handlerId !== "string") return;
      const payload =
        action.payload === "value" ||
        action.payload === "json" ||
        !action.payload
          ? nextValue
          : nextValue;
      try {
        const maybePromise = onInteraction({
          handlerId: action.handlerId,
          event: action.event ?? fallbackEvent,
          payload,
          componentId,
          displayId,
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          void maybePromise.catch((err: unknown) => {
            console.error("Text input interaction failed", err);
          });
        }
      } catch (err) {
        console.error("Text input interaction failed", err);
      }
    },
    [onInteraction, componentId, displayId]
  );

  const emitChange = (next: string) => {
    if (!onChange || effectiveDisabled) return;
    if (typeof onChange === "object" && onChange.debounceMs) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        dispatchEvent(onChange, next, "change");
      }, onChange.debounceMs);
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dispatchEvent(onChange, next, "change");
  };

  const emitSubmit = (next: string) => {
    if (!onSubmit || effectiveDisabled) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dispatchEvent(onSubmit, next, "submit");
  };

  const baseInputClasses =
    "w-full rounded-md border px-3 py-2 text-sm shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";
  const themeClasses =
    mode === "dark"
      ? "border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-500";

  const InputComponent = multiline ? "textarea" : "input";

  return (
    <div className={`flex w-full flex-col gap-2 ${className ?? ""}`}>
      {label ? (
        <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </label>
      ) : null}
      {description ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {description}
        </p>
      ) : null}
      <InputComponent
        value={current}
        placeholder={placeholder}
        disabled={effectiveDisabled}
        rows={multiline ? rows : undefined}
        className={`${baseInputClasses} ${themeClasses}`}
        onChange={(
          event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => {
          const next = event.target.value;
          setCurrent(next);
          emitChange(next);
        }}
        onBlur={() => {
          if (onSubmit) {
            emitSubmit(current);
          }
        }}
        onKeyDown={(
          event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => {
          if (!multiline && (event.key === "Enter" || event.key === "Return")) {
            event.preventDefault();
            if (onSubmit) {
              emitSubmit(current);
            }
          }
        }}
      />
    </div>
  );
};
