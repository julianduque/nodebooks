import React, { useEffect, useRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ThemeProvider } from "@/components/theme-context";
import PlotCellView from "@/components/notebook/plot-cell-view";
import type { NotebookCell, PlotCellResult } from "@nodebooks/notebook-schema";

const toImageMock = vi.fn(() =>
  Promise.resolve(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PfE4WgAAAABJRU5ErkJggg=="
  )
);

vi.mock("@nodebooks/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@nodebooks/ui")>("@nodebooks/ui");
  return {
    ...actual,
    PlotlyChart: ({
      onReady,
    }: {
      onReady?: (handle: {
        element: HTMLElement;
        plotly: { toImage: typeof toImageMock };
      }) => void;
    }) => {
      const readyRef = useRef(false);
      useEffect(() => {
        if (onReady && !readyRef.current) {
          readyRef.current = true;
          const element = document.createElement("div");
          onReady({ element, plotly: { toImage: toImageMock } });
        }
      }, [onReady]);
      return <div data-testid="plotly-chart" />;
    },
  };
});

describe("PlotCellView", () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const baseCell: Extract<NotebookCell, { type: "plot" }> = {
    id: "plot-1",
    type: "plot",
    metadata: {},
    chartType: "scatter",
    dataSource: { type: "global", variable: "readinessBySprint", path: [] },
    bindings: { traces: [{ id: "trace-1" }] },
    layout: {},
    result: {
      chartType: "scatter",
      source: { type: "global", variable: "readinessData", path: [] },
      fields: ["time", "value"],
      traces: [
        {
          id: "trace-1",
          type: "scatter",
          x: ["t1", "t2"],
          y: [1, 2],
        },
      ],
      layout: {},
      timestamp: new Date().toISOString(),
    } satisfies PlotCellResult,
  };

  it("updates bindings when field selections change", async () => {
    const onChange = vi.fn();
    const globals = {
      readinessBySprint: [
        { time: "t1", value: 1 },
        { time: "t2", value: 2 },
      ],
    } satisfies Record<string, unknown>;
    render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          notebookCells={[]}
          globals={globals}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    const xInput = screen.getByLabelText(/x field/i) as HTMLInputElement;

    fireEvent.change(xInput, { target: { value: "time" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updater] = onChange.mock.calls[0] as [
      (cell: NotebookCell) => NotebookCell,
      { persist?: boolean } | undefined,
    ];
    const updated = updater(baseCell);
    expect(updated.type).toBe("plot");
    const updatedTrace = (updated as typeof baseCell).bindings.traces[0];
    expect(updatedTrace.x).toBe("time");
  });

  it("updates trace types when chart type changes", () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          globals={{
            readinessBySprint: [
              { sprint: "Sprint 1", readiness: 55 },
              { sprint: "Sprint 2", readiness: 62 },
            ],
          }}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByLabelText(/chart type/i), {
      target: { value: "bar" },
    });

    expect(onChange).toHaveBeenCalled();
    const [updater] = onChange.mock.calls.at(-1) as [
      (cell: NotebookCell) => NotebookCell,
      { persist?: boolean } | undefined,
    ];
    const updated = updater(baseCell) as typeof baseCell;
    expect(updated.chartType).toBe("bar");
    const updatedTrace = updated.bindings.traces?.[0];
    expect(updatedTrace?.type).toBe("bar");
    expect(updated.result).toBeUndefined();
  });

  it("disables layout overrides when toggled off", () => {
    const onChange = vi.fn();
    const cellWithLayout = {
      ...baseCell,
      layout: { title: { text: "Custom" } },
      layoutEnabled: true,
    } as typeof baseCell;

    render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={cellWithLayout}
          globals={{
            readinessBySprint: [
              { sprint: "Sprint 1", readiness: 55 },
              { sprint: "Sprint 2", readiness: 62 },
            ],
          }}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("switch", { name: /layout overrides/i }));

    expect(onChange).toHaveBeenCalled();
    const [updater] = onChange.mock.calls.at(-1) as [
      (cell: NotebookCell) => NotebookCell,
      { persist?: boolean } | undefined,
    ];
    const updated = updater(cellWithLayout) as typeof cellWithLayout;
    expect(updated.layoutEnabled).toBe(false);
    expect(updated.layout).toEqual(cellWithLayout.layout);
    expect(updated.result).toEqual(cellWithLayout.result);
    expect(
      screen
        .queryByRole("switch", { name: /layout overrides/i })
        .getAttribute("aria-checked")
    ).toBe("false");
  });

  it("applies area defaults when chart type changes", () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          globals={{
            readinessBySprint: [
              { sprint: "Sprint 1", readiness: 55 },
              { sprint: "Sprint 2", readiness: 62 },
            ],
          }}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByLabelText(/chart type/i), {
      target: { value: "area" },
    });

    const [updater] = onChange.mock.calls.at(-1) as [
      (cell: NotebookCell) => NotebookCell,
      { persist?: boolean } | undefined,
    ];
    const updated = updater(baseCell) as typeof baseCell;
    const updatedTrace = updated.bindings.traces?.[0];
    expect(updatedTrace?.type).toBe("scatter");
    expect(updatedTrace?.mode).toBe("lines");
    expect(updatedTrace?.fill).toBe("tozeroy");
  });

  it("applies pie defaults when chart type changes", () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          globals={{
            readinessBySprint: [
              { sprint: "Sprint 1", readiness: 55 },
              { sprint: "Sprint 2", readiness: 62 },
            ],
          }}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    fireEvent.change(screen.getByLabelText(/chart type/i), {
      target: { value: "pie" },
    });

    const [updater] = onChange.mock.calls.at(-1) as [
      (cell: NotebookCell) => NotebookCell,
      { persist?: boolean } | undefined,
    ];
    const updated = updater(baseCell) as typeof baseCell;
    const updatedTrace = updated.bindings.traces?.[0];
    expect(updatedTrace?.type).toBe("pie");
    expect(updatedTrace?.mode).toBeUndefined();
  });

  it("reflects dataset availability from globals updates", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          globals={{}}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    expect(
      screen.queryByText(/Run the plot cell to load data from the kernel/i)
    ).not.toBeNull();

    rerender(
      <ThemeProvider initialTheme="light">
        <PlotCellView
          cell={baseCell}
          globals={{
            readinessBySprint: [
              { sprint: "Sprint 1", readiness: 55 },
              { sprint: "Sprint 2", readiness: 62 },
            ],
          }}
          onChange={onChange}
          onRun={vi.fn()}
          isRunning={false}
          canRun
        />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loaded 2 rows/i)).not.toBeNull();
    });
  });
});
