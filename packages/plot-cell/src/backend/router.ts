import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Notebook } from "@nodebooks/notebook-schema";
import type {
  NotebookCollaboratorStore,
  NotebookStore,
  SessionManager,
  NotebookRole,
} from "@nodebooks/cell-plugin-api";
import {
  PlotBindingsSchema,
  PlotCellResultSchema,
  PlotDataSourceSchema,
  type PlotDataSource,
  type PlotGlobalDataSource,
  type PlotTraceBinding,
} from "../schema.js";
type RequestUser = {
  id: string;
  role?: string;
};

const getRequestUser = (request: FastifyRequest): RequestUser | null => {
  const candidate = (request as FastifyRequest & { user?: RequestUser }).user;
  if (!candidate) {
    return null;
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  return { id: candidate.id, role: candidate.role };
};

const PlotCellExecutePayloadSchema = z.object({
  cellId: z.string().min(1),
  chartType: z.string().min(1),
  dataSource: PlotDataSourceSchema,
  bindings: PlotBindingsSchema,
  layout: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().min(1).optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const toRows = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    throw new Error("Resolved data is not an array");
  }
  return value.map((entry) => {
    if (isRecord(entry)) {
      return { ...entry };
    }
    return { value: entry };
  });
};

const resolvePath = (value: unknown, path: Array<string | number>) => {
  let current: unknown = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      if (typeof segment !== "number") {
        throw new Error("Array path segments must be numeric");
      }
      current = current[segment];
    } else if (isRecord(current)) {
      const key = String(segment);
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
};

const resolveGlobalRows = (
  globals: Record<string, unknown> | undefined,
  source: PlotGlobalDataSource
) => {
  const variable = (source.variable ?? "").trim();
  if (!variable) {
    throw new Error("Select a global variable before running the plot");
  }
  const map = globals ?? {};
  if (!Object.prototype.hasOwnProperty.call(map, variable)) {
    const availableVars = Object.keys(map).sort();
    const availableList =
      availableVars.length > 0
        ? ` Available variables: ${availableVars.join(", ")}`
        : " No variables are currently available in the runtime.";
    throw new Error(
      `Global '${variable}' is not available for plotting.${availableList}`
    );
  }
  const root = map[variable];
  const path = source.path ?? [];
  const resolved = path.length > 0 ? resolvePath(root, path) : root;
  if (resolved === undefined) {
    throw new Error(
      path.length > 0
        ? `Global '${variable}' does not contain data at ${path.join(".")}`
        : `Global '${variable}' does not contain data`
    );
  }
  return toRows(resolved);
};

const collectFields = (rows: Array<Record<string, unknown>>) => {
  const fields = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      fields.add(key);
    }
  }
  return Array.from(fields).sort();
};

const splitFieldPath = (field: string) =>
  field
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const extractFieldValue = (row: Record<string, unknown>, field: string) => {
  if (!field) {
    return undefined;
  }
  const path = splitFieldPath(field);
  let current: unknown = row;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
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

type TraceDefaults = {
  type: string;
  mode?: string;
  fill?: string;
  stackgroup?: string;
};

const getTraceDefaults = (chartType: string): TraceDefaults => {
  switch (chartType) {
    case "scatter":
      return { type: "scatter", mode: "markers" };
    case "line":
      return { type: "scatter", mode: "lines" };
    case "area":
      return {
        type: "scatter",
        mode: "lines",
        fill: "tozeroy",
        stackgroup: "area",
      };
    case "pie":
      return { type: "pie" };
    case "heatmap":
      return { type: "heatmap" };
    case "bar":
      return { type: "bar" };
    default:
      return { type: chartType };
  }
};

const buildTraceData = (
  bindings: PlotTraceBinding,
  rows: Array<Record<string, unknown>>,
  defaults: TraceDefaults
) => {
  const resolvedType = bindings.type ?? defaults.type;
  const traceType =
    typeof resolvedType === "string" ? resolvedType.toLowerCase() : "";
  const trace: Record<string, unknown> = {
    id: bindings.id,
    name: bindings.name,
    type: resolvedType,
  };

  const mode = bindings.mode ?? defaults.mode;
  if (mode !== undefined) {
    trace.mode = mode;
  }
  const fill = bindings.fill ?? defaults.fill;
  if (fill !== undefined) {
    trace.fill = fill;
  }
  const stackgroup = bindings.stackgroup ?? defaults.stackgroup;
  if (stackgroup !== undefined) {
    trace.stackgroup = stackgroup;
  }
  const pick = (field: string | undefined) =>
    field ? rows.map((row) => extractFieldValue(row, field)) : undefined;
  const x = pick(bindings.x);
  const y = pick(bindings.y);
  const z = pick(bindings.z);
  const color = pick(bindings.color);
  const size = pick(bindings.size);
  const text = pick(bindings.text);

  // Ensure arrays have valid values (keep undefined for missing fields but ensure array exists)
  const ensureArray = <T>(
    arr: Array<T | undefined> | undefined
  ): Array<T | undefined> | undefined => {
    if (!arr) return undefined;
    // Check if array has at least one defined value
    const hasValues = arr.some((v) => v !== undefined);
    return hasValues ? arr : undefined;
  };

  const validColor = ensureArray(color);
  const validSize = ensureArray(size);
  const validText = ensureArray(text);

  if (traceType === "pie") {
    if (x && x.length > 0) {
      trace.labels = x;
    }
    if (y && y.length > 0) {
      trace.values = y;
    } else if (!trace.values && x && x.length > 0) {
      trace.values = x;
    }
    if (validText && validText.length > 0) {
      const textArray = validText
        .filter((t): t is string | number => t !== undefined)
        .map((t) => String(t));
      if (textArray.length > 0) {
        trace.text = textArray;
      }
    }
  } else {
    if (x) trace.x = x;
    if (y) trace.y = y;
    if (z) trace.z = z;

    // Handle hover text - use hovertext for scatter plots
    if (validText && validText.length > 0) {
      const dataLength = Math.max(
        (x as unknown[])?.length ?? 0,
        (y as unknown[])?.length ?? 0
      );

      // Filter out undefined values and ensure array matches data length
      const textArray = validText
        .filter((t): t is string | number => t !== undefined)
        .map((t) => String(t));

      if (textArray.length > 0 && dataLength > 0) {
        let finalTextArray = textArray;
        if (textArray.length < dataLength) {
          // Repeat last text value to match data length
          const lastText = textArray[textArray.length - 1] ?? "";
          finalTextArray = [
            ...textArray,
            ...Array(dataLength - textArray.length).fill(lastText),
          ];
        } else if (textArray.length > dataLength) {
          // Truncate to match data length
          finalTextArray = textArray.slice(0, dataLength);
        }

        trace.hovertext = finalTextArray;
        trace.text = finalTextArray;
      }
    }

    // Handle colors and sizes - ensure markers are visible
    if (validColor || validSize) {
      const marker: Record<string, unknown> = {};

      // Ensure markers are visible when colors/sizes are provided
      const currentMode = String(trace.mode ?? mode ?? "");
      if (!currentMode.includes("markers")) {
        if (currentMode === "lines") {
          trace.mode = "lines+markers";
        } else if (currentMode === "") {
          trace.mode = "markers";
        } else {
          trace.mode = `${currentMode}+markers`;
        }
      }

      if (validColor && validColor.length > 0) {
        const dataLength = Math.max(
          (x as unknown[])?.length ?? 0,
          (y as unknown[])?.length ?? 0
        );

        // Filter out undefined and convert to strings
        const colorArray = validColor
          .filter((c): c is string | number => c !== undefined)
          .map((c) => String(c));

        if (colorArray.length > 0 && dataLength > 0) {
          let finalColorArray = colorArray;
          if (colorArray.length < dataLength) {
            // Repeat last color to match data length
            const lastColor =
              colorArray[colorArray.length - 1] ?? colorArray[0];
            finalColorArray = [
              ...colorArray,
              ...Array(dataLength - colorArray.length).fill(lastColor),
            ];
          } else if (colorArray.length > dataLength) {
            // Truncate to match data length
            finalColorArray = colorArray.slice(0, dataLength);
          }

          const firstColor = finalColorArray[0];
          const isNumeric =
            typeof firstColor === "string" &&
            !Number.isNaN(Number.parseFloat(firstColor)) &&
            !Number.isNaN(Number.parseInt(firstColor, 10));

          if (isNumeric) {
            // Numeric values - use a continuous colorscale
            marker.color = finalColorArray.map((c) => Number.parseFloat(c));
            marker.colorscale = "Viridis";
            marker.showscale = true;
          } else {
            // String color values - pass directly to Plotly
            marker.color = finalColorArray;
          }
        }
      }

      if (validSize && validSize.length > 0) {
        const dataLength = Math.max(
          (x as unknown[])?.length ?? 0,
          (y as unknown[])?.length ?? 0
        );

        // Convert to numbers and filter undefined
        let sizeArray = validSize
          .filter((s): s is string | number => s !== undefined)
          .map((s) =>
            typeof s === "number"
              ? s
              : typeof s === "string"
                ? Number.parseFloat(s) || 10
                : 10
          );

        if (sizeArray.length > 0 && dataLength > 0) {
          if (sizeArray.length < dataLength) {
            // Repeat last size to match data length
            const lastSize = sizeArray[sizeArray.length - 1] ?? 10;
            sizeArray = [
              ...sizeArray,
              ...Array(dataLength - sizeArray.length).fill(lastSize),
            ];
          } else if (sizeArray.length > dataLength) {
            // Truncate to match data length
            sizeArray = sizeArray.slice(0, dataLength);
          }

          marker.size = sizeArray;
        }
      }

      // Only set marker if we have at least one property
      if (Object.keys(marker).length > 0) {
        trace.marker = marker;
      }
    }

    // For line modes, also set line color if color is provided
    if (validColor && validColor.length > 0) {
      const currentMode = String(trace.mode ?? mode ?? "");
      if (currentMode.includes("lines")) {
        const colorArray = validColor
          .filter((c): c is string | number => c !== undefined)
          .map((c) => String(c));
        if (colorArray.length > 0) {
          const firstColor = colorArray[0];
          const isNumeric =
            typeof firstColor === "string" &&
            !Number.isNaN(Number.parseFloat(firstColor)) &&
            !Number.isNaN(Number.parseInt(firstColor, 10));

          if (!isNumeric) {
            // For string colors in line mode, use the first color for the entire line
            trace.line = { color: firstColor };
          }
        }
      }
    }
  }

  return trace;
};

const resolveRows = (
  notebook: Notebook,
  source: PlotDataSource,
  globals: Record<string, unknown> | undefined
) => {
  if (source.type !== "global") {
    throw new Error("Only global data sources are supported");
  }
  return resolveGlobalRows(globals, source);
};

export const registerPlotCellRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  sessions: SessionManager,
  getSessionGlobals?: (sessionId: string) => Record<string, unknown> | undefined
) => {
  app.post(
    "/notebooks/:id/plot-cells",
    async (request, reply): Promise<void> => {
      const params = z
        .object({ id: z.string().min(1) })
        .safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid notebook id" });
        return;
      }
      const notebookId = params.data.id;
      const notebook = await store.get(notebookId);
      if (!notebook) {
        void reply.code(404).send({ error: "Notebook not found" });
        return;
      }

      // Check authentication
      const user = getRequestUser(request);
      if (!user) {
        void reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      // Admin users have editor access
      let accessRole: NotebookRole | null = null;
      if (user.role === "admin") {
        accessRole = "editor";
      } else {
        // Check collaborator access
        const collaborator = await collaborators.get(notebookId, user.id);
        if (!collaborator) {
          void reply.code(403).send({ error: "Notebook access denied" });
          return;
        }
        const ROLE_RANK: Record<NotebookRole, number> = {
          viewer: 0,
          editor: 1,
          owner: 2,
        };
        if (ROLE_RANK[collaborator.role] < ROLE_RANK.editor) {
          void reply
            .code(403)
            .send({ error: "Notebook permission level is insufficient" });
          return;
        }
        accessRole = collaborator.role;
      }

      if (!accessRole) {
        return;
      }

      const payload = PlotCellExecutePayloadSchema.safeParse(
        request.body ?? {}
      );
      if (!payload.success) {
        void reply.code(400).send({ error: "Invalid plot payload" });
        return;
      }

      const { dataSource } = payload.data;
      let runtimeGlobals: Record<string, unknown> | undefined;
      if (dataSource.type === "global") {
        const sessionId = payload.data.sessionId?.trim();
        if (!sessionId) {
          void reply
            .code(400)
            .send({ error: "Runtime session is required to access globals" });
          return;
        }
        const activeSessions = await sessions.listSessions(notebook.id);
        const session = activeSessions.find(
          (entry) => entry.id === sessionId && entry.status === "open"
        );
        if (!session) {
          void reply
            .code(400)
            .send({ error: "Active runtime session not found for notebook" });
          return;
        }
        // Get globals from session using the provided function
        if (getSessionGlobals) {
          runtimeGlobals = getSessionGlobals(sessionId);
        } else {
          // Fallback: try to get globals from session object (legacy)
          const sessionData = session as { globals?: Record<string, unknown> };
          runtimeGlobals = sessionData.globals;
        }

        if (!runtimeGlobals || Object.keys(runtimeGlobals).length === 0) {
          const availableVars = runtimeGlobals
            ? Object.keys(runtimeGlobals).sort()
            : [];
          const message =
            availableVars.length > 0
              ? `No runtime globals are available. Available variables: ${availableVars.join(", ")}`
              : "No runtime globals are available. Run a code cell first to populate variables.";
          void reply.code(400).send({
            error: message,
            data: {
              result: {
                chartType: payload.data.chartType,
                source: payload.data.dataSource,
                layout: payload.data.layout ?? {},
                fields: [],
                traces: [],
                error: message,
                timestamp: new Date().toISOString(),
              },
            },
          });
          return;
        }
      }

      try {
        const rows = resolveRows(
          notebook,
          payload.data.dataSource,
          runtimeGlobals
        );
        if (rows.length === 0) {
          throw new Error("Source data is empty");
        }
        const fields = collectFields(rows);
        const traceDefaults = getTraceDefaults(payload.data.chartType);
        const traces = (payload.data.bindings.traces ?? []).map((binding) =>
          buildTraceData(binding, rows, traceDefaults)
        );
        const result = PlotCellResultSchema.parse({
          chartType: payload.data.chartType,
          source: payload.data.dataSource,
          layout: payload.data.layout ?? {},
          fields,
          traces,
          timestamp: new Date().toISOString(),
        });
        void reply.send({ data: { result } });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to prepare plot data";
        const result = PlotCellResultSchema.parse({
          chartType: payload.data.chartType,
          source: payload.data.dataSource,
          layout: payload.data.layout ?? {},
          fields: [],
          traces: [],
          error: message,
          timestamp: new Date().toISOString(),
        });
        void reply.code(400).send({ error: message, data: { result } });
      }
    }
  );
};
