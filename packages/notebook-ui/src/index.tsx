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

// UI Renderer
export interface UiRendererProps {
  display: UiDisplay;
  className?: string;
}

export const UiRenderer: React.FC<UiRendererProps> = ({
  display,
  className,
}) => {
  switch (display.ui) {
    case "image":
      return <Image {...display} className={className} />;
    case "markdown":
      return <Markdown {...display} className={className} />;
    case "html":
      return <HtmlBlock {...display} className={className} />;
    case "json":
      return <JsonViewer {...display} className={className} />;
    case "code":
      return <CodeBlock {...display} className={className} />;
    case "table":
      return <TableGrid {...display} className={className} />;
    case "dataSummary":
      return <DataSummary {...display} className={className} />;
    case "alert":
      return <AlertCallout {...display} className={className} />;
    case "badge":
      return <BadgeTag {...display} className={className} />;
    case "metric":
      return <MetricTile {...display} className={className} />;
    case "progress":
      return <ProgressBar {...display} className={className} />;
    case "spinner":
      return <Spinner {...display} className={className} />;
    default:
      return null;
  }
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
