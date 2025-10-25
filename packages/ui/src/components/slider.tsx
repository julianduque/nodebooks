"use client";
import React from "react";
import type { UiSlider } from "@nodebooks/notebook-schema";
import { useUiInteractionContext } from "./interaction-context";
import { useComponentThemeMode } from "./utils";

export interface SliderProps extends Omit<UiSlider, "ui" | "componentId"> {
  componentId?: string;
  className?: string;
  themeMode?: "light" | "dark";
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const InteractiveSlider: React.FC<SliderProps> = ({
  label,
  description,
  min = 0,
  max,
  step,
  value,
  defaultValue,
  disabled,
  showValue,
  onChange,
  onCommit,
  componentId,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const { onInteraction, displayId } = useUiInteractionContext();
  const hasDispatcher = Boolean(onInteraction);
  const effectiveDisabled = disabled || !hasDispatcher;

  const resolvedMax = Number.isFinite(max) ? max : min + 100;
  const resolvedStep = typeof step === "number" && step > 0 ? step : 1;
  const initial =
    typeof value === "number"
      ? clamp(value, min, resolvedMax)
      : typeof defaultValue === "number"
        ? clamp(defaultValue, min, resolvedMax)
        : min;

  const [current, setCurrent] = React.useState<number>(initial);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (typeof value === "number" && Number.isFinite(value)) {
      setCurrent(clamp(value, min, resolvedMax));
    }
  }, [value, min, resolvedMax]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const dispatchInteraction = React.useCallback(
    (
      action: UiSlider["onChange"] | UiSlider["onCommit"],
      nextValue: number
    ) => {
      if (!action || !onInteraction || typeof action !== "object") {
        return;
      }
      if (typeof action.handlerId !== "string") {
        return;
      }
      const payload =
        action.payload === "json" || action.payload === "text"
          ? nextValue.toString()
          : action.payload === "value" || !action.payload
            ? nextValue
            : nextValue;
      try {
        const maybePromise = onInteraction({
          handlerId: action.handlerId,
          event: action.event ?? "change",
          payload,
          componentId,
          displayId,
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          void maybePromise.catch((err: unknown) => {
            console.error("Slider interaction failed", err);
          });
        }
      } catch (err) {
        console.error("Slider interaction failed", err);
      }
    },
    [onInteraction, componentId, displayId]
  );

  const handleChange = (raw: string) => {
    if (effectiveDisabled) return;
    const next = clamp(Number(raw), min, resolvedMax);
    setCurrent(next);

    if (!onChange || effectiveDisabled) return;
    if (typeof onChange === "object" && onChange.debounceMs) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        dispatchInteraction(onChange, next);
      }, onChange.debounceMs);
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    dispatchInteraction(onChange, next);
  };

  const handleCommit = (nextValue: number) => {
    if (!onCommit || effectiveDisabled) return;
    dispatchInteraction(onCommit, nextValue);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleChange(event.target.value);
  };

  const handlePointerUp = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (onChange && typeof onChange === "object" && onChange.debounceMs) {
        dispatchInteraction(onChange, current);
      }
    }
    handleCommit(current);
  };

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
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={resolvedMax}
          step={resolvedStep}
          value={current}
          disabled={effectiveDisabled}
          onChange={handleInputChange}
          onMouseUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          onKeyUp={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handlePointerUp();
            }
          }}
          className={`h-2 w-full appearance-none rounded-full ${
            mode === "dark"
              ? "bg-slate-700 accent-sky-400"
              : "bg-slate-200 accent-sky-600"
          }`}
        />
        {showValue ? (
          <span className="w-12 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
            {Number.isFinite(current) ? current.toFixed(2) : "—"}
          </span>
        ) : null}
      </div>
    </div>
  );
};
