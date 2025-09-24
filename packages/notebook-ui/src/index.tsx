"use client";

import React from "react";
import type { UiDisplay } from "@nodebooks/notebook-schema";
import { Image } from "./components/image";
import { Markdown } from "./components/markdown";
import { HtmlBlock } from "./components/html";
import { JsonViewer } from "./components/jsonViewer";
import { CodeBlock } from "./components/codeBlock";
import { TableGrid } from "./components/tableGrid";
import { DataSummary } from "./components/dataSummary";
import { AlertCallout } from "./components/alert";
import { BadgeTag } from "./components/badge";
import { MetricTile } from "./components/metric";
import { ProgressBar } from "./components/progress";
import { Spinner } from "./components/spinner";
import { UiCard } from "./components/uiCard";

// UI Renderer
export interface UiRendererProps {
  display: UiDisplay;
  className?: string;
}

export const UiRenderer: React.FC<UiRendererProps> = ({
  display,
  className,
}) => {
  let inner: React.ReactElement | null = null;
  switch (display.ui) {
    case "image":
      inner = <Image {...display} className={className} />;
      break;
    case "markdown":
      inner = <Markdown {...display} className={className} />;
      break;
    case "html":
      inner = <HtmlBlock {...display} className={className} />;
      break;
    case "json":
      inner = <JsonViewer {...display} className={className} />;
      break;
    case "code":
      inner = <CodeBlock {...display} className={className} />;
      break;
    case "table":
      inner = <TableGrid {...display} className={className} />;
      break;
    case "dataSummary":
      inner = <DataSummary {...display} className={className} />;
      break;
    case "alert":
      inner = <AlertCallout {...display} className={className} />;
      break;
    case "badge":
      inner = <BadgeTag {...display} className={className} />;
      break;
    case "metric":
      inner = <MetricTile {...display} className={className} />;
      break;
    case "progress":
      inner = <ProgressBar {...display} className={className} />;
      break;
    case "spinner":
      inner = <Spinner {...display} className={className} />;
      break;
    default:
      inner = null;
  }
  if (!inner) return null;
  return <UiCard>{inner}</UiCard>;
};

export default UiRenderer;

// Re-exports of individual components for convenience
export { Image } from "./components/image";
export { Markdown } from "./components/markdown";
export { HtmlBlock } from "./components/html";
export { JsonViewer } from "./components/jsonViewer";
export { CodeBlock } from "./components/codeBlock";
export { TableGrid } from "./components/tableGrid";
export { DataSummary } from "./components/dataSummary";
export { AlertCallout } from "./components/alert";
export { BadgeTag } from "./components/badge";
export { MetricTile } from "./components/metric";
export { ProgressBar } from "./components/progress";
export { Spinner } from "./components/spinner";
export { UiCard } from "./components/uiCard";
