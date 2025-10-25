"use client";
import React from "react";
import type { UiContainer, UiDisplay } from "@nodebooks/notebook-schema";
import { UiThemeContext } from "./theme";
import { useComponentThemeMode } from "./utils";

type PaddingValue =
  | number
  | [number, number]
  | [number, number, number, number];

const normalizePadding = (padding?: PaddingValue): React.CSSProperties => {
  if (typeof padding === "number") {
    return { padding: `${padding}px` };
  }
  if (Array.isArray(padding)) {
    if (padding.length === 2) {
      const [vertical, horizontal] = padding;
      return {
        paddingTop: `${vertical}px`,
        paddingBottom: `${vertical}px`,
        paddingLeft: `${horizontal}px`,
        paddingRight: `${horizontal}px`,
      };
    }
    if (padding.length === 4) {
      const [top, right, bottom, left] = padding;
      return {
        paddingTop: `${top}px`,
        paddingRight: `${right}px`,
        paddingBottom: `${bottom}px`,
        paddingLeft: `${left}px`,
      };
    }
  }
  return {};
};

const justifyClass = (value?: UiContainer["justify"]) => {
  switch (value) {
    case "center":
      return "justify-center";
    case "end":
      return "justify-end";
    case "between":
      return "justify-between";
    case "start":
    default:
      return "justify-start";
  }
};

const alignClass = (value?: UiContainer["align"]) => {
  switch (value) {
    case "center":
      return "items-center";
    case "end":
      return "items-end";
    case "stretch":
      return "items-stretch";
    case "start":
    default:
      return "items-start";
  }
};

interface ContainerProps
  extends Omit<UiContainer, "ui" | "children" | "componentId"> {
  componentId?: string;
  items: UiDisplay[];
  className?: string;
  themeMode?: "light" | "dark";
  renderItem: (display: UiDisplay, index: number) => React.ReactNode;
}

export const Container: React.FC<ContainerProps> = ({
  direction = "vertical",
  wrap,
  gap,
  align,
  justify,
  padding,
  background,
  border,
  title,
  subtitle,
  items,
  className,
  themeMode,
  renderItem,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const flexDirection = direction === "horizontal" ? "row" : "column";
  const flexWrap = wrap ? "flex-wrap" : "flex-nowrap";
  const outerStyles: React.CSSProperties = {
    ...(normalizePadding(padding) as React.CSSProperties),
  };
  if (background) {
    outerStyles.backgroundColor = background;
  } else if (mode === "dark") {
    outerStyles.backgroundColor = "rgba(15, 23, 42, 0.75)";
  } else {
    outerStyles.backgroundColor = "rgba(255, 255, 255, 0.92)";
  }
  if (border && border.width && border.width > 0) {
    outerStyles.borderWidth = border.width;
    outerStyles.borderStyle = "solid";
    if (border.color) {
      outerStyles.borderColor = border.color;
    }
  }
  if (border?.radius) {
    outerStyles.borderRadius = border.radius;
  } else {
    outerStyles.borderRadius = 12;
  }

  const innerStyles: React.CSSProperties = { flexDirection };
  if (typeof gap === "number") {
    innerStyles.gap = `${gap}px`;
  } else if (gap === undefined) {
    innerStyles.gap = direction === "horizontal" ? "0.75rem" : "1rem";
  }

  return (
    <UiThemeContext.Provider value={mode}>
      <div
        className={`flex flex-col gap-3 border border-transparent shadow-sm transition-colors ${
          className ?? ""
        }`}
        style={outerStyles}
      >
        {(title || subtitle) && (
          <div className="flex flex-col gap-1">
            {title ? (
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p className="text-sm text-slate-700 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
        )}
        <div
          className={`flex ${flexWrap} ${justifyClass(justify)} ${alignClass(
            align
          )}`}
          style={innerStyles}
        >
          {items.map((item, index) => {
            const key =
              typeof item === "object" && item !== null && "componentId" in item
                ? ((item as { componentId?: string }).componentId ?? `${index}`)
                : `${index}`;
            return (
              <div key={key} className="min-w-0">
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </UiThemeContext.Provider>
  );
};
