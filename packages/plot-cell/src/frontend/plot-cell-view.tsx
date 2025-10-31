"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type {
  PlotTraceBinding,
  PlotGlobalDataSource,
  PlotCell,
} from "../schema";
import { PlotlyChart } from "@nodebooks/ui";
import {
  Button,
  Input,
  Separator,
  Switch,
  Badge,
} from "@nodebooks/client-ui/components/ui";
import {
  MonacoEditor,
  MONACO_EDITOR_CONTAINER_CLASS,
  MONACO_EDITOR_WRAPPER_CLASS,
} from "@nodebooks/client-ui/components/monaco";
import {
  registerPlotLayoutCommitter,
  unregisterPlotLayoutCommitter,
  type PlotLayoutCommitResult,
} from "./plot-layout-committers.js";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import {
  Plus as PlusIcon,
  Trash2,
  ScatterChart,
  LineChart,
  BarChart3,
  AreaChart,
  PieChart,
  Grid3x3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ChartTypeOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

type MinimalMonacoEditor = {
  onDidBlurEditorText: (listener: () => void) => { dispose(): void };
};

type BlurDisposable = ReturnType<MinimalMonacoEditor["onDidBlurEditorText"]>;

const CHART_TYPE_OPTIONS: readonly ChartTypeOption[] = [
  { value: "scatter", label: "Scatter", icon: ScatterChart },
  { value: "line", label: "Line", icon: LineChart },
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "area", label: "Area", icon: AreaChart },
  { value: "pie", label: "Pie", icon: PieChart },
  { value: "heatmap", label: "Heatmap", icon: Grid3x3 },
] as const;

const BASE_SELECT_CLASS =
  "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

type PlotCellType = PlotCell & NotebookCell;

const createTraceId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `trace_${Math.random().toString(36).slice(2, 10)}`;
};

const stringifyLayout = (layout: PlotCell["layout"] | undefined) => {
  if (!layout || Object.keys(layout).length === 0) {
    return "";
  }
  try {
    return JSON.stringify(layout, null, 2);
  } catch {
    return "";
  }
};

const parsePathSegments = (raw: string): Array<string | number> => {
  return raw
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      /^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment
    );
};

const serializePath = (segments: Array<string | number>): string => {
  if (!segments || segments.length === 0) {
    return "";
  }
  return segments
    .map((segment) => (typeof segment === "number" ? String(segment) : segment))
    .join(".");
};

const formatPathLabel = (segments: Array<string | number>): string => {
  if (!segments || segments.length === 0) {
    return "root";
  }
  return segments
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".");
};

const pathsEqual = (
  a: Array<string | number> | undefined,
  b: Array<string | number> | undefined
) => {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment === right[index]);
};

const hasLayoutOverrides = (layout?: Record<string, unknown>) => {
  if (!layout) {
    return false;
  }
  return Object.keys(layout).length > 0;
};

type TraceDefaults = {
  type: string;
  mode?: string;
  fill?: string;
  stackgroup?: string;
};

const CHART_TYPE_DEFAULTS: Record<string, TraceDefaults> = {
  scatter: { type: "scatter", mode: "markers" },
  line: { type: "scatter", mode: "lines" },
  bar: { type: "bar" },
  area: { type: "scatter", mode: "lines", fill: "tozeroy", stackgroup: "area" },
  pie: { type: "pie" },
  heatmap: { type: "heatmap" },
};

const getTraceDefaults = (chartType: string): TraceDefaults => {
  return CHART_TYPE_DEFAULTS[chartType] ?? { type: chartType };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const resolveValueAtPath = (
  value: unknown,
  path: Array<string | number> | undefined
): unknown => {
  if (!path || path.length === 0) {
    return value;
  }
  let current: unknown = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      if (typeof segment !== "number") {
        return undefined;
      }
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
};

type ArraySuggestion = {
  path: Array<string | number>;
  size: number;
};

const collectArraySuggestions = (
  value: unknown,
  prefix: Array<string | number> = [],
  visited = new Set<unknown>(),
  depth = 0,
  maxDepth = 3
): ArraySuggestion[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (visited.has(value)) {
    return [];
  }
  if (Array.isArray(value) || isRecord(value)) {
    visited.add(value);
  }
  const suggestions: ArraySuggestion[] = [];
  if (Array.isArray(value)) {
    suggestions.push({ path: prefix, size: value.length });
    if (depth >= maxDepth) {
      return suggestions;
    }
    const representative = value.find((item) => isRecord(item)) ?? value[0];
    if (representative && isRecord(representative)) {
      const entries = Object.entries(representative).slice(0, 5);
      for (const [key, child] of entries) {
        suggestions.push(
          ...collectArraySuggestions(
            child as unknown,
            [...prefix, key],
            visited,
            depth + 1,
            maxDepth
          )
        );
      }
    }
    return suggestions;
  }
  if (isRecord(value)) {
    if (depth >= maxDepth) {
      return suggestions;
    }
    const entries = Object.entries(value).slice(0, 12);
    for (const [key, child] of entries) {
      suggestions.push(
        ...collectArraySuggestions(
          child as unknown,
          [...prefix, key],
          visited,
          depth + 1,
          maxDepth
        )
      );
    }
  }
  return suggestions;
};

type GlobalDataSource = PlotGlobalDataSource;

const defaultGlobalDataSource: GlobalDataSource = {
  type: "global",
  variable: "",
  path: [] as Array<string | number>,
};

type PlotCellViewProps = CellComponentProps & {
  cell: PlotCellType;
  globals?: Record<string, unknown>;
  isRunning?: boolean;
  canRun?: boolean;
};

const PlotCellView = ({
  cell,
  globals = {},
  onChange,
  onRun,
  isRunning = false,
  readOnly = false,
  canRun = false,
}: PlotCellViewProps) => {
  const globalSource: GlobalDataSource =
    cell.dataSource?.type === "global"
      ? {
          type: "global",
          variable: cell.dataSource.variable ?? "",
          path: Array.isArray(cell.dataSource.path)
            ? [...cell.dataSource.path]
            : ([] as Array<string | number>),
        }
      : defaultGlobalDataSource;

  const [layoutDraft, setLayoutDraft] = useState(() =>
    stringifyLayout(cell.layout)
  );
  const [layoutEnabled, setLayoutEnabled] = useState<boolean>(
    () => cell.layoutEnabled ?? hasLayoutOverrides(cell.layout)
  );
  const [layoutEditorOpen, setLayoutEditorOpen] = useState<boolean>(
    () => cell.layoutEnabled ?? hasLayoutOverrides(cell.layout)
  );
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(
    () => new Set()
  );
  const [configCollapsed, setConfigCollapsed] = useState(false);

  useEffect(() => {
    setLayoutDraft(stringifyLayout(cell.layout));
  }, [cell.layout]);
  useEffect(() => {
    const nextEnabled = cell.layoutEnabled ?? hasLayoutOverrides(cell.layout);
    setLayoutEnabled(nextEnabled);
    setLayoutEditorOpen(nextEnabled);
  }, [cell.layoutEnabled, cell.layout]);

  const [variableDraft, setVariableDraft] = useState(
    globalSource.variable ?? ""
  );
  useEffect(() => {
    setVariableDraft(globalSource.variable ?? "");
  }, [globalSource.variable]);

  const [pathDraft, setPathDraft] = useState(
    serializePath(globalSource.path ?? [])
  );
  useEffect(() => {
    setPathDraft(serializePath(globalSource.path ?? []));
  }, [globalSource.path]);

  const persistedVariable = (globalSource.variable ?? "").trim();
  const chartTypeValue = (cell.chartType ?? "").trim() || "scatter";

  const selectedChartOption = useMemo(
    () => CHART_TYPE_OPTIONS.find((option) => option.value === chartTypeValue),
    [chartTypeValue]
  );
  const ChartIcon = selectedChartOption?.icon ?? ScatterChart;

  const layoutBlurDisposable = useRef<BlurDisposable | null>(null);

  const resolvedDataset = useMemo(() => {
    if (!persistedVariable) {
      return undefined;
    }
    return resolveValueAtPath(
      globals[persistedVariable],
      globalSource.path ?? []
    );
  }, [globals, persistedVariable, globalSource.path]);

  const datasetArray = Array.isArray(resolvedDataset)
    ? (resolvedDataset as Array<unknown>)
    : null;

  const datasetFieldPreview = useMemo(() => {
    if (!datasetArray || datasetArray.length === 0) {
      return [] as string[];
    }
    const example = datasetArray.find((item) => isRecord(item)) as
      | Record<string, unknown>
      | undefined;
    if (!example) {
      return [] as string[];
    }
    return Object.keys(example).slice(0, 6);
  }, [datasetArray]);

  const arraySuggestions = useMemo(() => {
    if (!persistedVariable) {
      return [] as ArraySuggestion[];
    }
    const value = globals[persistedVariable];
    if (value === undefined) {
      return [] as ArraySuggestion[];
    }
    const collected = collectArraySuggestions(value);
    const unique = new Map<string, ArraySuggestion>();
    for (const suggestion of collected) {
      const key = serializePath(suggestion.path);
      if (!unique.has(key)) {
        unique.set(key, suggestion);
      }
    }
    return Array.from(unique.values()).slice(0, 8);
  }, [globals, persistedVariable]);

  const globalValue = persistedVariable
    ? globals[persistedVariable]
    : undefined;
  const suggestionCount = arraySuggestions.length;

  useEffect(() => {
    return () => {
      layoutBlurDisposable.current?.dispose();
      layoutBlurDisposable.current = null;
    };
  }, []);

  const updatePlot = useCallback(
    (
      updater: (current: PlotCellType) => PlotCellType,
      options?: { persist?: boolean }
    ) => {
      onChange((current) => {
        if (current.type !== "plot") {
          return current;
        }
        return updater(current as PlotCellType);
      }, options);
    },
    [onChange]
  );

  const commitVariableDraft = useCallback(() => {
    const next = variableDraft.trim();
    updatePlot(
      (current) => {
        const source: GlobalDataSource =
          current.dataSource?.type === "global"
            ? {
                type: "global",
                variable: current.dataSource.variable ?? "",
                path: Array.isArray(current.dataSource.path)
                  ? [...current.dataSource.path]
                  : ([] as Array<string | number>),
              }
            : defaultGlobalDataSource;
        const existing = (source.variable ?? "").trim();
        if (existing === next) {
          return current;
        }
        // Clear result and invalidate trace field bindings when variable changes
        const currentTraces = current.bindings?.traces ?? [];
        const updatedTraces = currentTraces.map((trace) => ({
          ...trace,
          // Clear field bindings that might reference fields from the old dataset
          x: undefined,
          y: undefined,
          z: undefined,
          color: undefined,
          size: undefined,
          text: undefined,
        }));
        return {
          ...current,
          dataSource: {
            type: "global",
            variable: next,
            path: [] as Array<string | number>,
          },
          result: undefined,
          bindings: {
            traces: updatedTraces,
          },
        } as PlotCellType;
      },
      { persist: true }
    );
  }, [updatePlot, variableDraft]);

  const handleVariableBlur = useCallback(() => {
    commitVariableDraft();
  }, [commitVariableDraft]);

  const handleVariableKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitVariableDraft();
        (event.target as HTMLInputElement).blur();
      }
    },
    [commitVariableDraft]
  );

  const commitPathDraft = useCallback(() => {
    const segments = parsePathSegments(pathDraft);
    updatePlot(
      (current) => {
        const source: GlobalDataSource =
          current.dataSource?.type === "global"
            ? {
                type: "global",
                variable: current.dataSource.variable ?? "",
                path: Array.isArray(current.dataSource.path)
                  ? [...current.dataSource.path]
                  : ([] as Array<string | number>),
              }
            : defaultGlobalDataSource;
        if (pathsEqual(source.path, segments)) {
          return current;
        }
        // Clear result when path changes to ensure field options update
        const currentTraces = current.bindings?.traces ?? [];
        const updatedTraces = currentTraces.map((trace) => ({
          ...trace,
          // Clear field bindings that might reference fields from the old path
          x: undefined,
          y: undefined,
          z: undefined,
          color: undefined,
          size: undefined,
          text: undefined,
        }));
        return {
          ...current,
          dataSource: {
            type: "global",
            variable: source.variable ?? "",
            path: segments,
          },
          result: undefined,
          bindings: {
            traces: updatedTraces,
          },
        } as PlotCellType;
      },
      { persist: true }
    );
  }, [pathDraft, updatePlot]);

  const handlePathBlur = useCallback(() => {
    commitPathDraft();
  }, [commitPathDraft]);

  const handlePathKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitPathDraft();
        (event.target as HTMLInputElement).blur();
      }
    },
    [commitPathDraft]
  );

  const handleApplySuggestion = useCallback(
    (suggestion: ArraySuggestion) => {
      setPathDraft(serializePath(suggestion.path));
      updatePlot(
        (current) => {
          const source: GlobalDataSource =
            current.dataSource?.type === "global"
              ? {
                  type: "global",
                  variable: current.dataSource.variable ?? "",
                  path: Array.isArray(current.dataSource.path)
                    ? [...current.dataSource.path]
                    : ([] as Array<string | number>),
                }
              : defaultGlobalDataSource;
          if (pathsEqual(source.path, suggestion.path)) {
            return current;
          }
          return {
            ...current,
            dataSource: {
              type: "global",
              variable: source.variable ?? "",
              path: suggestion.path,
            },
          } as PlotCellType;
        },
        { persist: true }
      );
    },
    [updatePlot]
  );

  const autoPathRef = useRef<{ variable: string; pathKey: string } | null>(
    null
  );

  useEffect(() => {
    if (!persistedVariable) {
      return;
    }
    const value = globals[persistedVariable];
    if (value === undefined) {
      return;
    }
    const candidate = collectArraySuggestions(value)[0];
    if (!candidate) {
      return;
    }
    const key = `${persistedVariable}:${serializePath(candidate.path)}`;
    if (
      autoPathRef.current &&
      autoPathRef.current.variable === persistedVariable &&
      autoPathRef.current.pathKey === key
    ) {
      return;
    }
    if (pathsEqual(globalSource.path, candidate.path)) {
      autoPathRef.current = { variable: persistedVariable, pathKey: key };
      return;
    }
    updatePlot(
      (current) => {
        if (current.type !== "plot") {
          return current;
        }
        return {
          ...current,
          dataSource: {
            type: "global",
            variable: persistedVariable,
            path: candidate.path,
          },
        } as PlotCellType;
      },
      { persist: true }
    );
    autoPathRef.current = { variable: persistedVariable, pathKey: key };
  }, [globals, globalSource.path, persistedVariable, updatePlot]);

  const datasetStatus = useMemo(() => {
    if (!persistedVariable) {
      return "Select a dataset variable to load data.";
    }
    if (datasetArray) {
      if (datasetArray.length === 0) {
        return "Dataset is empty (0 rows).";
      }
      return `Data source: '${persistedVariable}'`;
    }
    if (globalValue === undefined) {
      return "Run the plot cell to load data from the kernel.";
    }
    // Check if the value is an object (which might contain arrays)
    const isObject = isRecord(globalValue);
    if (suggestionCount > 0) {
      return "Select or enter a data path that resolves to an array inside this global.";
    }
    if (isObject) {
      return "Enter a data path to access an array property within this object (e.g., 'propertyName' or 'nested.property').";
    }
    return "Unable to find an array in this global. Adjust the data path or rerun the source cell.";
  }, [datasetArray, globalValue, persistedVariable, suggestionCount]);

  const datasetStatusTone = useMemo(() => {
    if (!persistedVariable) {
      return "text-muted-foreground";
    }
    if (globalValue === undefined) {
      return "text-muted-foreground";
    }
    return datasetArray ? "text-muted-foreground" : "text-amber-600";
  }, [datasetArray, globalValue, persistedVariable]);

  const runDisabled =
    readOnly ||
    !canRun ||
    isRunning ||
    (cell.dataSource?.type === "global" && !persistedVariable);

  const variableListId = useMemo(() => `plot-${cell.id}-globals`, [cell.id]);
  const pathListId = useMemo(() => `plot-${cell.id}-paths`, [cell.id]);
  const variableInputId = useMemo(
    () => `plot-${cell.id}-variable-input`,
    [cell.id]
  );
  const pathInputId = useMemo(() => `plot-${cell.id}-path-input`, [cell.id]);
  const availableVariables = useMemo(
    () => Object.keys(globals).sort((a, b) => a.localeCompare(b)),
    [globals]
  );

  const fieldOptions = useMemo(() => {
    // Prioritize live datasetArray over cached result fields
    // This ensures field options update immediately when the variable changes
    if (datasetArray && datasetArray.length > 0) {
      const example = datasetArray.find((item) => isRecord(item)) as
        | Record<string, unknown>
        | undefined;
      if (example) {
        return Object.keys(example);
      }
    }
    // Fall back to result fields if available (after running)
    if (cell.result?.fields && cell.result.fields.length > 0) {
      return cell.result.fields;
    }
    return [];
  }, [cell.result?.fields, datasetArray]);

  const mergedLayout = useMemo(() => {
    const base = cell.result?.layout ?? {};
    if (!layoutEnabled) {
      return base;
    }
    const overrides = cell.layout ?? {};
    return { ...base, ...overrides };
  }, [cell.layout, cell.result?.layout, layoutEnabled]);

  const traces = useMemo(
    () => cell.bindings?.traces ?? [],
    [cell.bindings?.traces]
  );

  useEffect(() => {
    setExpandedTraces((prev) => {
      const next = new Set<string>();
      for (const trace of traces) {
        if (prev.has(trace.id)) {
          next.add(trace.id);
        }
      }
      return next;
    });
  }, [traces]);

  const handleChartTypeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement> | ChangeEvent<HTMLInputElement>) => {
      const nextChartType = event.target.value.trim() || "scatter";
      const previousChartType = chartTypeValue;
      const nextDefaults = getTraceDefaults(nextChartType);
      const previousDefaults = getTraceDefaults(previousChartType);
      updatePlot(
        (current) => {
          const currentTraces = current.bindings?.traces ?? [];
          const updatedTraces = currentTraces.map((trace) => {
            const nextTrace: PlotTraceBinding = { ...trace };
            if (!trace.type || trace.type === previousDefaults.type) {
              nextTrace.type = nextDefaults.type;
            }
            if (nextDefaults.mode !== undefined) {
              if (!trace.mode || trace.mode === previousDefaults.mode) {
                nextTrace.mode = nextDefaults.mode;
              }
            } else if (
              trace.mode !== undefined &&
              trace.mode === previousDefaults.mode
            ) {
              delete nextTrace.mode;
            }
            if (nextDefaults.fill !== undefined) {
              if (!trace.fill || trace.fill === previousDefaults.fill) {
                nextTrace.fill = nextDefaults.fill;
              }
            } else if (
              trace.fill !== undefined &&
              trace.fill === previousDefaults.fill
            ) {
              delete nextTrace.fill;
            }
            if (nextDefaults.stackgroup !== undefined) {
              if (
                !trace.stackgroup ||
                trace.stackgroup === previousDefaults.stackgroup
              ) {
                nextTrace.stackgroup = nextDefaults.stackgroup;
              }
            } else if (
              trace.stackgroup !== undefined &&
              trace.stackgroup === previousDefaults.stackgroup
            ) {
              delete nextTrace.stackgroup;
            }
            return nextTrace;
          });
          return {
            ...current,
            chartType: nextChartType,
            bindings: {
              ...(current.bindings ?? {}),
              traces: updatedTraces,
            },
            result: undefined,
          };
        },
        { persist: true }
      );
    },
    [chartTypeValue, updatePlot]
  );

  const handleTraceChange = useCallback(
    (index: number, update: Partial<PlotTraceBinding>) => {
      updatePlot(
        (current) => {
          const currentTraces = current.bindings?.traces ?? [];
          if (!currentTraces[index]) {
            return current;
          }
          const nextTraces = [...currentTraces];
          nextTraces[index] = { ...nextTraces[index], ...update };
          return {
            ...current,
            bindings: { traces: nextTraces },
          };
        },
        { persist: true }
      );
    },
    [updatePlot]
  );

  const handleTraceRemove = useCallback(
    (index: number) => {
      if (readOnly) return;
      updatePlot(
        (current) => {
          const currentTraces = current.bindings?.traces ?? [];
          if (!currentTraces[index]) {
            return current;
          }
          const nextTraces = currentTraces.filter((_, idx) => idx !== index);
          return {
            ...current,
            bindings: { traces: nextTraces },
          };
        },
        { persist: true }
      );
    },
    [readOnly, updatePlot]
  );

  const handleAddTrace = useCallback(() => {
    if (readOnly) return;
    const trace: PlotTraceBinding = {
      id: createTraceId(),
      name: `Series ${traces.length + 1}`,
    };
    updatePlot(
      (current) => {
        const currentTraces = current.bindings?.traces ?? [];
        return {
          ...current,
          bindings: { traces: [...currentTraces, trace] },
        };
      },
      { persist: true }
    );
  }, [readOnly, traces.length, updatePlot]);

  const toggleTraceExpanded = useCallback((traceId: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  }, []);

  const handleLayoutToggle = useCallback(
    (next: boolean) => {
      if (readOnly) {
        return;
      }
      if (!next) {
        setLayoutEnabled(false);
        setLayoutError(null);
        setLayoutEditorOpen(false);
        updatePlot(
          (current) =>
            ({
              ...current,
              layoutEnabled: false,
            }) as PlotCellType,
          { persist: true }
        );
        return;
      }

      const currentLayoutSource =
        cell.layout && Object.keys(cell.layout).length > 0
          ? cell.layout
          : (cell.result?.layout ?? {});
      const draftSeed = stringifyLayout(currentLayoutSource);
      if (!layoutDraft || layoutDraft.trim().length === 0) {
        setLayoutDraft(draftSeed);
      }

      const trimmed = (layoutDraft || draftSeed).trim();
      let parsedLayout: Record<string, unknown> = {};
      if (trimmed) {
        try {
          parsedLayout = JSON.parse(trimmed) as Record<string, unknown>;
          setLayoutError(null);
        } catch (error) {
          setLayoutError(
            error instanceof Error
              ? error.message
              : "Layout overrides must be valid JSON"
          );
          return;
        }
      } else {
        setLayoutError(null);
      }

      setLayoutEnabled(true);
      setLayoutEditorOpen(true);
      updatePlot(
        (current) =>
          ({
            ...current,
            layoutEnabled: true,
            layout: parsedLayout,
          }) as PlotCellType,
        { persist: true }
      );
    },
    [cell, layoutDraft, readOnly, updatePlot]
  );

  const commitLayoutOverrides = useCallback((): PlotLayoutCommitResult => {
    if (readOnly) {
      setLayoutError(null);
      return { ok: true };
    }
    if (!layoutEnabled) {
      setLayoutError(null);
      return { ok: true };
    }
    const trimmed = layoutDraft.trim();
    if (!trimmed) {
      let changed = false;
      updatePlot(
        (current) => {
          if (current.type !== "plot") {
            return current;
          }
          const hasOverrides =
            current.layout && Object.keys(current.layout).length > 0;
          if (current.layoutEnabled === true && !hasOverrides) {
            return current;
          }
          changed = true;
          return {
            ...current,
            layoutEnabled: true,
            layout: {},
          } as PlotCellType;
        },
        { persist: true }
      );
      setLayoutError(null);
      if (changed) {
        setLayoutDraft("");
      }
      return { ok: true };
    }
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      let changed = false;
      updatePlot(
        (current) => {
          if (current.type !== "plot") {
            return current;
          }
          const nextString = stringifyLayout(parsed);
          const currentString = stringifyLayout(current.layout);
          if (current.layoutEnabled === true && currentString === nextString) {
            return current;
          }
          changed = true;
          return {
            ...current,
            layoutEnabled: true,
            layout: parsed,
          } as PlotCellType;
        },
        { persist: true }
      );
      setLayoutError(null);
      if (changed) {
        setLayoutDraft(stringifyLayout(parsed));
      }
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Layout overrides must be valid JSON";
      setLayoutError(message);
      return { ok: false, error: message };
    }
  }, [layoutDraft, layoutEnabled, readOnly, updatePlot]);

  useEffect(() => {
    registerPlotLayoutCommitter(cell.id, commitLayoutOverrides);
    return () => {
      unregisterPlotLayoutCommitter(cell.id, commitLayoutOverrides);
    };
  }, [cell.id, commitLayoutOverrides]);

  const handleLayoutBlur = useCallback(() => {
    void commitLayoutOverrides();
  }, [commitLayoutOverrides]);

  const handleLayoutEditorMount = useCallback(
    (editorInstance: MinimalMonacoEditor) => {
      layoutBlurDisposable.current?.dispose();
      layoutBlurDisposable.current = editorInstance.onDidBlurEditorText(() => {
        handleLayoutBlur();
      });
    },
    [handleLayoutBlur]
  );

  const handleSubmitShortcut = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!event.shiftKey || event.key !== "Enter") {
        return;
      }
      if (readOnly) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isRunning || runDisabled) {
        return;
      }
      onRun();
    },
    [isRunning, onRun, readOnly, runDisabled]
  );

  const result = cell.result;
  const hasTraces = Array.isArray(result?.traces) && result.traces.length > 0;
  const rowsApprox = hasTraces
    ? Math.max(
        ...result!.traces
          .map((trace) =>
            [trace.x, trace.y, trace.z, trace.text]
              .filter(Array.isArray)
              .map((arr) => (Array.isArray(arr) ? arr.length : 0))
          )
          .flat()
      )
    : 0;

  return (
    <div
      className="space-y-4 rounded-2xl border border-border bg-card p-4 text-sm text-card-foreground shadow-sm"
      onKeyDownCapture={handleSubmitShortcut}
    >
      {configCollapsed ? (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfigCollapsed(false)}
            className="text-xs"
          >
            <ChevronDown className="mr-1 h-3 w-3" />
            Show configuration
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfigCollapsed(true)}
              className="text-xs"
              title="Collapse configuration"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid w-full gap-3 md:grid-cols-3 md:items-end">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ChartIcon className="h-4 w-4" />
                  Chart type
                </span>
                <div className="relative">
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  />
                  <select
                    className={`${BASE_SELECT_CLASS} pr-10`}
                    value={chartTypeValue}
                    onChange={handleChartTypeChange}
                    disabled={readOnly}
                  >
                    {CHART_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    {!CHART_TYPE_OPTIONS.some(
                      (opt) => opt.value === chartTypeValue
                    ) && cell.chartType ? (
                      <option value={cell.chartType}>{cell.chartType}</option>
                    ) : null}
                  </select>
                </div>
              </label>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  htmlFor={variableInputId}
                >
                  Dataset variable
                </label>
                <Input
                  id={variableInputId}
                  value={variableDraft}
                  onChange={(event) => setVariableDraft(event.target.value)}
                  onBlur={handleVariableBlur}
                  onKeyDown={handleVariableKeyDown}
                  disabled={readOnly}
                  placeholder="Select a variable"
                  list={variableListId}
                  className="h-9"
                />
                <datalist id={variableListId}>
                  {availableVariables.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="flex flex-col gap-1 md:col-span-1">
                <label
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  htmlFor={pathInputId}
                >
                  Data path (optional)
                </label>
                <Input
                  id={pathInputId}
                  value={pathDraft}
                  onChange={(event) => setPathDraft(event.target.value)}
                  onBlur={handlePathBlur}
                  onKeyDown={handlePathKeyDown}
                  disabled={readOnly || !persistedVariable}
                  placeholder={
                    persistedVariable
                      ? "rows or metrics.ready"
                      : "Select a variable first"
                  }
                  list={pathListId}
                  className="h-9"
                />
                <datalist id={pathListId}>
                  {arraySuggestions.map((suggestion) => (
                    <option
                      key={serializePath(suggestion.path)}
                      value={serializePath(suggestion.path)}
                    />
                  ))}
                </datalist>
              </div>

              {arraySuggestions.length > 0 ||
              datasetArray ||
              datasetFieldPreview.length > 0 ? (
                <div className="md:col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {arraySuggestions.length > 0 ? (
                    <>
                      <span className="font-medium text-muted-foreground">
                        Suggestions:
                      </span>
                      {arraySuggestions.map((suggestion) => (
                        <Badge
                          key={serializePath(suggestion.path)}
                          variant="secondary"
                          className="cursor-pointer text-xs font-normal transition hover:bg-secondary/80"
                          onClick={() => handleApplySuggestion(suggestion)}
                          role="button"
                          tabIndex={readOnly ? -1 : 0}
                          onKeyDown={(e) => {
                            if (
                              !readOnly &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              handleApplySuggestion(suggestion);
                            }
                          }}
                        >
                          {formatPathLabel(suggestion.path)}
                          {suggestion.size !== undefined
                            ? ` (${suggestion.size})`
                            : null}
                        </Badge>
                      ))}
                    </>
                  ) : null}
                  {datasetArray ? (
                    <>
                      <span className="font-medium text-muted-foreground ml-1">
                        Loaded {datasetArray.length} row
                        {datasetArray.length === 1 ? "" : "s"}.
                      </span>
                    </>
                  ) : null}
                  {datasetFieldPreview.length > 0 ? (
                    <>
                      <span className="font-medium text-muted-foreground ml-1">
                        Fields:
                      </span>
                      {datasetFieldPreview.map((field) => (
                        <Badge
                          key={field}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {field}
                        </Badge>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}

              <p className={`text-xs md:col-span-3 ${datasetStatusTone}`}>
                {datasetStatus}
              </p>
            </div>
          </div>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Trace mappings
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Enter dataset field names (column names) in the fields below.
            </p>
            <div className="rounded-lg border border-border bg-card/80">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed text-sm">
                  <thead>
                    <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-[180px] px-3 py-2 text-left">Trace</th>
                      <th className="w-[150px] px-3 py-2 text-left">X field</th>
                      <th className="w-[150px] px-3 py-2 text-left">Y field</th>
                      <th className="w-[150px] px-3 py-2 text-left">
                        Color field
                      </th>
                      <th className="w-[120px] px-3 py-2 text-left">
                        Size field
                      </th>
                      <th className="w-[160px] px-3 py-2 text-left">
                        Text field
                      </th>
                      <th className="w-[120px] px-3 py-2 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-4 text-center text-xs text-muted-foreground"
                        >
                          Define at least one trace to map dataset fields to
                          chart channels.
                        </td>
                      </tr>
                    ) : (
                      traces.map((trace, index) => {
                        const defaults = getTraceDefaults(chartTypeValue);
                        const expanded = expandedTraces.has(trace.id);
                        return (
                          <Fragment key={trace.id}>
                            <tr className="border-t border-border/70">
                              <td className="px-3 py-2 align-top">
                                <div className="space-y-1">
                                  <Input
                                    value={trace.name ?? ""}
                                    aria-label={`Trace ${index + 1} name`}
                                    placeholder={`Series ${index + 1}`}
                                    disabled={readOnly}
                                    className="h-9"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        name: event.target.value || undefined,
                                      })
                                    }
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="relative">
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                  />
                                  <select
                                    value={trace.x ?? ""}
                                    disabled={readOnly}
                                    className={`${BASE_SELECT_CLASS} pr-10`}
                                    aria-label="X field name"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        x: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Select X ...</option>
                                    {fieldOptions.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="relative">
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                  />
                                  <select
                                    value={trace.y ?? ""}
                                    disabled={readOnly}
                                    className={`${BASE_SELECT_CLASS} pr-10`}
                                    aria-label="Y field name"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        y: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Select Y ...</option>
                                    {fieldOptions.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="relative">
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                  />
                                  <select
                                    value={trace.color ?? ""}
                                    disabled={readOnly}
                                    className={`${BASE_SELECT_CLASS} pr-10`}
                                    aria-label="Color field name"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        color: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Select color ...</option>
                                    {fieldOptions.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="relative">
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                  />
                                  <select
                                    value={trace.size ?? ""}
                                    disabled={readOnly}
                                    className={`${BASE_SELECT_CLASS} pr-10`}
                                    aria-label="Size field name"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        size: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Select size ...</option>
                                    {fieldOptions.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="relative">
                                  <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                  />
                                  <select
                                    value={trace.text ?? ""}
                                    disabled={readOnly}
                                    className={`${BASE_SELECT_CLASS} pr-10`}
                                    aria-label="Text field name"
                                    onChange={(event) =>
                                      handleTraceChange(index, {
                                        text: event.target.value || undefined,
                                      })
                                    }
                                  >
                                    <option value="">Select text ...</option>
                                    {fieldOptions.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      toggleTraceExpanded(trace.id)
                                    }
                                    aria-label={
                                      expanded
                                        ? `Hide advanced options for trace ${index + 1}`
                                        : `Show advanced options for trace ${index + 1}`
                                    }
                                  >
                                    {expanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleTraceRemove(index)}
                                    disabled={readOnly}
                                    aria-label={`Remove trace ${index + 1}`}
                                    className="text-destructive hover:text-destructive/80"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="border-t border-border/60 bg-muted/40">
                                <td colSpan={7} className="px-3 py-3">
                                  <div className="flex gap-3">
                                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Mode
                                      </span>
                                      <Input
                                        value={trace.mode ?? ""}
                                        placeholder={defaults.mode ?? "auto"}
                                        disabled={readOnly}
                                        className="h-9"
                                        onChange={(event) =>
                                          handleTraceChange(index, {
                                            mode:
                                              event.target.value || undefined,
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Z field
                                      </span>
                                      <div className="relative">
                                        <ChevronDown
                                          aria-hidden="true"
                                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                                        />
                                        <select
                                          value={trace.z ?? ""}
                                          disabled={readOnly}
                                          className={`${BASE_SELECT_CLASS} pr-10`}
                                          onChange={(event) =>
                                            handleTraceChange(index, {
                                              z:
                                                event.target.value || undefined,
                                            })
                                          }
                                        >
                                          <option value="">
                                            None (optional)
                                          </option>
                                          {fieldOptions.map((field) => (
                                            <option key={field} value={field}>
                                              {field}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </label>
                                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Fill
                                      </span>
                                      <Input
                                        value={trace.fill ?? ""}
                                        placeholder={defaults.fill ?? "none"}
                                        disabled={readOnly}
                                        className="h-9"
                                        onChange={(event) =>
                                          handleTraceChange(index, {
                                            fill:
                                              event.target.value || undefined,
                                          })
                                        }
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Stack
                                      </span>
                                      <Input
                                        value={trace.stackgroup ?? ""}
                                        placeholder={
                                          defaults.stackgroup ?? "group"
                                        }
                                        disabled={readOnly}
                                        className="h-9"
                                        onChange={(event) =>
                                          handleTraceChange(index, {
                                            stackgroup:
                                              event.target.value || undefined,
                                          })
                                        }
                                      />
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {readOnly ? null : (
                <div className="flex items-center justify-end border-t border-border/60 bg-muted/40 px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="flex items-center gap-2"
                    onClick={handleAddTrace}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add trace
                  </Button>
                </div>
              )}
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Layout overrides (JSON)</span>
              <div className="flex items-center gap-2 font-medium normal-case">
                <span className="text-[11px] text-muted-foreground">
                  {layoutEnabled ? "Enabled" : "Disabled"}
                </span>
                <Switch
                  checked={layoutEnabled}
                  onCheckedChange={handleLayoutToggle}
                  disabled={readOnly}
                  srLabel="Layout overrides"
                />
              </div>
              {layoutError ? (
                <span className="font-medium text-rose-500">{layoutError}</span>
              ) : null}
            </div>
            {layoutEnabled ? (
              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setLayoutEditorOpen((open) => !open)}
                  >
                    {layoutEditorOpen ? "Hide editor" : "Show editor"}
                  </Button>
                </div>
                {layoutEditorOpen ? (
                  <div className={`relative ${MONACO_EDITOR_WRAPPER_CLASS}`}>
                    <MonacoEditor
                      className={MONACO_EDITOR_CONTAINER_CLASS}
                      height={180}
                      language="json"
                      defaultLanguage="json"
                      theme="vs-dark"
                      value={layoutDraft}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        lineNumbers: "off",
                        fontSize: 12,
                        padding: { top: 12, bottom: 12 },
                        readOnly,
                      }}
                      onChange={(value) => setLayoutDraft(value ?? "")}
                      onMount={(editor) => handleLayoutEditorMount(editor)}
                    />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the layout returned from the backend.
                  Provide JSON to override axes, legends, or titles.
                </p>
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="space-y-3">
        <header className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          {result?.error ? (
            <div className="rounded-lg border border-rose-400 bg-rose-100/80 p-3 text-xs text-rose-700">
              <strong>Error:</strong> {result.error}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {hasTraces
                ? `Generated ${result?.traces.length ?? 0} trace${
                    (result?.traces.length ?? 0) === 1 ? "" : "s"
                  } from ${rowsApprox} row${rowsApprox === 1 ? "" : "s"}`
                : "Run the cell to prepare chart data."}
            </p>
          )}
        </header>
        {hasTraces ? (
          <PlotlyChart
            data={result?.traces ?? []}
            layout={mergedLayout}
            config={{ displayModeBar: true }}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {result?.error
              ? "Fix the error above and try again."
              : "Configure traces and run the cell to preview the chart."}
          </div>
        )}
      </section>
    </div>
  );
};

export default PlotCellView;
