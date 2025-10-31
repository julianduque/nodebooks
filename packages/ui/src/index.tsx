"use client";

import React from "react";
import type { UiDisplay } from "@nodebooks/notebook-schema";
import { Image } from "./components/image.js";
import { Markdown } from "./components/markdown.js";
import { HtmlBlock } from "./components/html.js";
import { JsonViewer } from "./components/json-viewer.js";
import { CodeBlock } from "./components/code-block.js";
import { TableGrid } from "./components/table-grid.js";
import { DataSummary } from "./components/data-summary.js";
import { AlertCallout } from "./components/alert.js";
import { BadgeTag } from "./components/badge.js";
import { MetricTile } from "./components/metric.js";
import { ProgressBar } from "./components/progress.js";
import { Spinner } from "./components/spinner.js";
import { UiCard } from "./components/ui-card.js";
import { VegaLiteChart } from "./components/vega-lite.js";
import { PlotlyChart } from "./components/plotly-chart.js";
import { HeatmapMatrix } from "./components/heatmap.js";
import { NetworkGraph } from "./components/network-graph.js";
import { Plot3dScene } from "./components/plot3d.js";
import { MapView, GeoJsonMap } from "./components/map.js";
import { Container } from "./components/container.js";
import { InteractiveButton } from "./components/interactive-button.js";
import { InteractiveSlider } from "./components/slider.js";
import { InteractiveTextInput } from "./components/text-input.js";
import {
  UiInteractionContext,
  type UiInteractionDispatcher,
} from "./components/interaction-context.js";

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
export { Image } from "./components/image.js";
export { Markdown } from "./components/markdown.js";
export { HtmlBlock } from "./components/html.js";
export { JsonViewer } from "./components/json-viewer.js";
export { CodeBlock } from "./components/code-block.js";
export { CopyButton } from "./components/copy-button.js";
export type { CopyButtonProps } from "./components/copy-button.js";
export { TableGrid } from "./components/table-grid.js";
export { DataSummary } from "./components/data-summary.js";
export { VegaLiteChart } from "./components/vega-lite.js";
export { PlotlyChart } from "./components/plotly-chart.js";
export { HeatmapMatrix } from "./components/heatmap.js";
export { NetworkGraph } from "./components/network-graph.js";
export { Plot3dScene } from "./components/plot3d.js";
export { MapView, GeoJsonMap } from "./components/map.js";
export { AlertCallout } from "./components/alert.js";
export { BadgeTag } from "./components/badge.js";
export { MetricTile } from "./components/metric.js";
export { ProgressBar } from "./components/progress.js";
export { Spinner } from "./components/spinner.js";
export { UiCard } from "./components/ui-card.js";
export { Container } from "./components/container.js";
export { InteractiveButton } from "./components/interactive-button.js";
export { InteractiveSlider } from "./components/slider.js";
export { InteractiveTextInput } from "./components/text-input.js";
export {
  UiInteractionContext,
  type UiInteractionDispatcher,
  type UiInteractionEvent,
} from "./components/interaction-context.js";
