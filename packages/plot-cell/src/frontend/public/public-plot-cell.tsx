"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlotlyChart } from "@nodebooks/ui";
import type { PublicCellComponentProps } from "@nodebooks/cell-plugin-api";
import type { PlotCell } from "../../schema.js";

type PublicPlotCellProps = PublicCellComponentProps & {
  cell: PlotCell;
  globals: Record<string, unknown>;
};

const fallbackLayout = (cell: PlotCell) => {
  if (cell.layout && Object.keys(cell.layout ?? {}).length > 0) {
    return cell.layout ?? {};
  }
  return cell.result?.layout ?? {};
};

const PublicPlotCell = ({ cell }: PublicPlotCellProps) => {
  const [mergedLayout, setMergedLayout] = useState<Record<string, unknown>>(
    () => fallbackLayout(cell)
  );

  useEffect(() => {
    setMergedLayout(fallbackLayout(cell));
  }, [cell]);

  const traces = useMemo(
    () => cell.result?.traces ?? [],
    [cell.result?.traces]
  );
  const hasTraces = traces.length > 0;
  const resolvedTitle = useMemo(() => {
    const extract = (layout?: Record<string, unknown>) => {
      if (!layout) return undefined;
      const title = layout.title as { text?: unknown } | undefined;
      const text = title?.text;
      return typeof text === "string" ? text : undefined;
    };
    return (
      extract(cell.result?.layout ?? undefined) ??
      extract(cell.layout ?? undefined)
    );
  }, [cell.layout, cell.result?.layout]);

  const handleReady = useCallback(() => undefined, []);

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">
          {resolvedTitle ?? "Plot"}
        </h3>
        {cell.result?.error ? (
          <p className="text-xs font-medium text-rose-600">
            {cell.result.error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {hasTraces
              ? `Rendered ${traces.length} trace${
                  traces.length === 1 ? "" : "s"
                } from shared data`
              : "Run this plot in the notebook to generate data."}
          </p>
        )}
      </header>
      {hasTraces ? (
        <PlotlyChart
          data={traces}
          layout={mergedLayout}
          config={{ displayModeBar: false, responsive: true }}
          onReady={handleReady}
        />
      ) : (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No chart data available. Run the source notebook to populate this
          plot.
        </div>
      )}
      <footer className="text-[11px] text-muted-foreground">
        {cell.dataSource?.type === "global" && cell.dataSource.variable ? (
          <span>
            Data source: <code>{cell.dataSource.variable}</code>
          </span>
        ) : (
          <span>Data source: notebook cell output</span>
        )}
      </footer>
    </div>
  );
};

export default PublicPlotCell;
