"use client";

import React from "react";
import type { UiDisplay } from "@nodebooks/notebook-schema";
import { Image } from "./components/image";
import { Markdown } from "./components/markdown";
import { HtmlBlock } from "./components/html";
import { JsonViewer } from "./components/json-viewer";
import { CodeBlock } from "./components/code-block";
import { TableGrid } from "./components/table-grid";
import { DataSummary } from "./components/data-summary";
import { AlertCallout } from "./components/alert";
import { BadgeTag } from "./components/badge";
import { MetricTile } from "./components/metric";
import { ProgressBar } from "./components/progress";
import { Spinner } from "./components/spinner";
import { UiCard } from "./components/ui-card";
import { VegaLiteChart } from "./components/vega-lite";
import { PlotlyChart } from "./components/plotly-chart";
import { HeatmapMatrix } from "./components/heatmap";
import { NetworkGraph } from "./components/network-graph";
import { Plot3dScene } from "./components/plot3d";
import { MapView, GeoJsonMap } from "./components/map";
import { Container } from "./components/container";
import { InteractiveButton } from "./components/interactive-button";
import { InteractiveSlider } from "./components/slider";
import { InteractiveTextInput } from "./components/text-input";
import {
  UiInteractionContext,
  type UiInteractionDispatcher,
} from "./components/interaction-context";

// UI Renderer
export interface UiRendererProps {
  display: UiDisplay;
  className?: string;
  displayId?: string;
  onInteraction?: UiInteractionDispatcher;
  disableCard?: boolean;
}

export const UiRenderer: React.FC<UiRendererProps> = ({
  display,
  className,
  displayId,
  onInteraction,
  disableCard,
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
    case "vegaLite":
      inner = <VegaLiteChart {...display} className={className} />;
      break;
    case "plotly":
      inner = <PlotlyChart {...display} className={className} />;
      break;
    case "heatmap":
      inner = <HeatmapMatrix {...display} className={className} />;
      break;
    case "networkGraph":
      inner = <NetworkGraph {...display} className={className} />;
      break;
    case "plot3d":
      inner = <Plot3dScene {...display} className={className} />;
      break;
    case "map":
      inner = <MapView {...display} className={className} />;
      break;
    case "geoJson":
      inner = <GeoJsonMap {...display} className={className} />;
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
    case "container": {
      const { children, ...rest } = display;
      inner = (
        <Container
          {...rest}
          items={children}
          className={className}
          renderItem={(child) => (
            <UiRenderer
              display={child}
              disableCard
              displayId={displayId}
              onInteraction={onInteraction}
            />
          )}
        />
      );
      break;
    }
    case "button":
      inner = <InteractiveButton {...display} className={className} />;
      break;
    case "slider":
      inner = <InteractiveSlider {...display} className={className} />;
      break;
    case "textInput":
      inner = <InteractiveTextInput {...display} className={className} />;
      break;
    default:
      inner = null;
  }
  if (!inner) return null;
  const content = (
    <UiInteractionContext.Provider
      value={{ displayId, onInteraction: onInteraction ?? null }}
    >
      {inner}
    </UiInteractionContext.Provider>
  );
  if (disableCard) {
    return content;
  }
  return <UiCard>{content}</UiCard>;
};

export default UiRenderer;

// Re-exports of individual components for convenience
export { Image } from "./components/image";
export { Markdown } from "./components/markdown";
export { HtmlBlock } from "./components/html";
export { JsonViewer } from "./components/json-viewer";
export { CodeBlock } from "./components/code-block";
export { CopyButton } from "./components/copy-button";
export type { CopyButtonProps } from "./components/copy-button";
export { TableGrid } from "./components/table-grid";
export { DataSummary } from "./components/data-summary";
export { VegaLiteChart } from "./components/vega-lite";
export { PlotlyChart } from "./components/plotly-chart";
export { HeatmapMatrix } from "./components/heatmap";
export { NetworkGraph } from "./components/network-graph";
export { Plot3dScene } from "./components/plot3d";
export { MapView, GeoJsonMap } from "./components/map";
export { AlertCallout } from "./components/alert";
export { BadgeTag } from "./components/badge";
export { MetricTile } from "./components/metric";
export { ProgressBar } from "./components/progress";
export { Spinner } from "./components/spinner";
export { UiCard } from "./components/ui-card";
export { Container } from "./components/container";
export { InteractiveButton } from "./components/interactive-button";
export { InteractiveSlider } from "./components/slider";
export { InteractiveTextInput } from "./components/text-input";
export {
  UiInteractionContext,
  type UiInteractionDispatcher,
  type UiInteractionEvent,
} from "./components/interaction-context";
