export const uiHelpersModuleJs = String.raw`"use strict";
const DISPLAY_ID = Symbol("nodebooks.ui.displayId");
let displayCounter = 0;
let componentCounter = 0;

const hidden = (target, key, value) => {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
};

const cloneData = (source) => {
  const clone = {};
  for (const key in source) {
    clone[key] = source[key];
  }
  return clone;
};

const shouldEmit = (opts) => {
  if (!opts || typeof opts !== "object") {
    return true;
  }
  const emit = opts.emit !== false;
  if (Object.prototype.hasOwnProperty.call(opts, "emit")) {
    delete opts.emit;
  }
  return emit;
};

const getGlobalObject = () => {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
};

const getHooks = () => {
  const globalObj = getGlobalObject();
  return {
    emit:
      typeof globalObj.__nodebooks_display === "function"
        ? globalObj.__nodebooks_display.bind(globalObj)
        : null,
    update:
      typeof globalObj.__nodebooks_update_display === "function"
        ? globalObj.__nodebooks_update_display.bind(globalObj)
        : null,
    register:
      typeof globalObj.__nodebooks_register_ui_handler === "function"
        ? globalObj.__nodebooks_register_ui_handler.bind(globalObj)
        : null,
  };
};

const emitPayload = (value, hooks, id, isUpdate) => {
  if (!hooks.emit && !hooks.update) return;
  const payload = cloneData(value);
  payload.__nb_ui_emitted = true;
  if (isUpdate && hooks.update) {
    hooks.update(payload, { displayId: id });
    return;
  }
  if (hooks.emit) {
    hooks.emit(payload, { displayId: id, update: !!isUpdate });
  }
};

const applyPatch = (target, patch) => {
  if (!patch) return;
  let next = patch;
  if (typeof next === "function") {
    next = next(target) || {};
  }
  if (!next || typeof next !== "object") {
    return;
  }
  for (const key of Object.keys(next)) {
    if (key === "ui") continue;
    target[key] = next[key];
  }
};

const ensureComponentId = (target, requested) => {
  let id =
    typeof requested === "string" && requested.trim().length > 0
      ? requested.trim()
      : undefined;
  if (
    !id &&
    typeof target.componentId === "string" &&
    target.componentId.trim().length > 0
  ) {
    id = target.componentId.trim();
  }
  if (!id) {
    id = "cmp_" + String(++componentCounter);
  }
  target.componentId = id;
  return id;
};

const normalizeChildDisplay = (child) => {
  if (!child || typeof child !== "object") {
    return child;
  }
  if (child.__nb_ui_emitted) {
    const clone = cloneData(child);
    ensureComponentId(clone, child.componentId);
    return clone;
  }
  if ("ui" in child && typeof child.ui === "string") {
    const clone = cloneData(child);
    ensureComponentId(clone, child.componentId);
    return clone;
  }
  return child;
};

const registerHandler = (handler, meta) => {
  if (typeof handler !== "function") {
    return null;
  }
  const hooks = getHooks();
  if (!hooks.register) {
    throw new Error(
      "Interactive UI helpers require a runtime with interaction support"
    );
  }
  return hooks.register(handler, meta || {});
};

function finalizeDisplay(display, emit) {
  return emit ? __nb_emit(display) : display;
}

function __nb_emit(obj, forceUpdate) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }
  let id = obj[DISPLAY_ID];
  let isNew = false;
  if (!id) {
    id = "ui_" + String(++displayCounter);
    hidden(obj, DISPLAY_ID, id);
    isNew = true;
  }
  hidden(obj, "__nb_ui_emitted", true);
  if (!Object.prototype.hasOwnProperty.call(obj, "update")) {
    hidden(obj, "update", function update(patch) {
      applyPatch(obj, patch);
      hidden(obj, "__nb_ui_emitted", true);
      const hooks = getHooks();
      emitPayload(obj, hooks, obj[DISPLAY_ID], true);
      return obj;
    });
  }
  const hooks = getHooks();
  emitPayload(obj, hooks, id, forceUpdate || !isNew ? true : false);
  return obj;
}

function UiImage(srcOrOpts, opts) {
  if (
    srcOrOpts &&
    typeof srcOrOpts === "object" &&
    !Array.isArray(srcOrOpts) &&
    "src" in srcOrOpts
  ) {
    const normalized = cloneData(srcOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "image" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.src = srcOrOpts;
  return finalizeDisplay(Object.assign({ ui: "image" }, normalized), emit);
}
function UiMarkdown(markdownOrOpts, opts) {
  if (
    markdownOrOpts &&
    typeof markdownOrOpts === "object" &&
    !Array.isArray(markdownOrOpts) &&
    "markdown" in markdownOrOpts
  ) {
    const normalized = cloneData(markdownOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(
      Object.assign({ ui: "markdown" }, normalized),
      emit
    );
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.markdown = markdownOrOpts;
  return finalizeDisplay(Object.assign({ ui: "markdown" }, normalized), emit);
}
function UiHTML(htmlOrOpts, opts) {
  if (
    htmlOrOpts &&
    typeof htmlOrOpts === "object" &&
    !Array.isArray(htmlOrOpts) &&
    "html" in htmlOrOpts
  ) {
    const normalized = cloneData(htmlOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "html" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.html = htmlOrOpts;
  return finalizeDisplay(Object.assign({ ui: "html" }, normalized), emit);
}
function UiJSON(jsonOrOpts, opts) {
  if (
    jsonOrOpts &&
    typeof jsonOrOpts === "object" &&
    !Array.isArray(jsonOrOpts) &&
    "json" in jsonOrOpts
  ) {
    const normalized = cloneData(jsonOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "json" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.json = jsonOrOpts;
  return finalizeDisplay(Object.assign({ ui: "json" }, normalized), emit);
}
function UiCode(codeOrOpts, opts) {
  if (
    codeOrOpts &&
    typeof codeOrOpts === "object" &&
    !Array.isArray(codeOrOpts) &&
    "code" in codeOrOpts
  ) {
    const normalized = cloneData(codeOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "code" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.code = codeOrOpts;
  return finalizeDisplay(Object.assign({ ui: "code" }, normalized), emit);
}
function UiTable(rowsOrOpts, opts) {
  if (Array.isArray(rowsOrOpts)) {
    const normalized = cloneData(opts || {});
    const emit = shouldEmit(normalized);
    normalized.rows = rowsOrOpts;
    return finalizeDisplay(Object.assign({ ui: "table" }, normalized), emit);
  }
  if (
    rowsOrOpts &&
    typeof rowsOrOpts === "object" &&
    "rows" in rowsOrOpts
  ) {
    const normalized = cloneData(rowsOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "table" }, normalized), emit);
  }
  throw new Error(
    "UiTable expects an array of rows or an options object with { rows }"
  );
}
function UiDataSummary(opts) {
  if (opts && typeof opts === "object") {
    const normalized = cloneData(opts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(
      Object.assign({ ui: "dataSummary" }, normalized),
      emit
    );
  }
  throw new Error("UiDataSummary expects an options object");
}
function UiVegaLite(specOrOpts, opts) {
  if (
    specOrOpts &&
    typeof specOrOpts === "object" &&
    !Array.isArray(specOrOpts) &&
    "spec" in specOrOpts
  ) {
    if (!specOrOpts.spec || typeof specOrOpts.spec !== "object") {
      throw new Error("UiVegaLite expects a spec object");
    }
    const normalized = cloneData(specOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "vegaLite" }, normalized), emit);
  }
  if (!specOrOpts || typeof specOrOpts !== "object") {
    throw new Error("UiVegaLite expects a spec object");
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.spec = specOrOpts;
  return finalizeDisplay(Object.assign({ ui: "vegaLite" }, normalized), emit);
}
function UiPlotly(dataOrOpts, opts) {
  if (Array.isArray(dataOrOpts)) {
    const normalized = cloneData(opts || {});
    const emit = shouldEmit(normalized);
    normalized.data = dataOrOpts;
    return finalizeDisplay(Object.assign({ ui: "plotly" }, normalized), emit);
  }
  if (
    !dataOrOpts ||
    typeof dataOrOpts !== "object" ||
    !Array.isArray(dataOrOpts.data)
  ) {
    throw new Error("UiPlotly expects an array of traces in 'data'");
  }
  const normalized = cloneData(dataOrOpts);
  const emit = shouldEmit(normalized);
  return finalizeDisplay(Object.assign({ ui: "plotly" }, normalized), emit);
}
function UiHeatmap(valuesOrOpts, opts) {
  if (Array.isArray(valuesOrOpts)) {
    const normalized = cloneData(opts || {});
    const emit = shouldEmit(normalized);
    normalized.values = valuesOrOpts;
    return finalizeDisplay(Object.assign({ ui: "heatmap" }, normalized), emit);
  }
  if (
    !valuesOrOpts ||
    typeof valuesOrOpts !== "object" ||
    !Array.isArray(valuesOrOpts.values)
  ) {
    throw new Error("UiHeatmap expects a 2D number array in 'values'");
  }
  const normalized = cloneData(valuesOrOpts);
  const emit = shouldEmit(normalized);
  return finalizeDisplay(Object.assign({ ui: "heatmap" }, normalized), emit);
}
function UiNetworkGraph(nodesOrOpts, links, opts) {
  if (Array.isArray(nodesOrOpts) && Array.isArray(links)) {
    const normalized = cloneData(opts || {});
    const emit = shouldEmit(normalized);
    normalized.nodes = nodesOrOpts;
    normalized.links = links;
    return finalizeDisplay(
      Object.assign({ ui: "networkGraph" }, normalized),
      emit
    );
  }
  if (
    !nodesOrOpts ||
    typeof nodesOrOpts !== "object" ||
    !Array.isArray(nodesOrOpts.nodes) ||
    !Array.isArray(nodesOrOpts.links)
  ) {
    throw new Error("UiNetworkGraph expects 'nodes' and 'links' arrays");
  }
  const normalized = cloneData(nodesOrOpts);
  const emit = shouldEmit(normalized);
  return finalizeDisplay(
    Object.assign({ ui: "networkGraph" }, normalized),
    emit
  );
}
function UiPlot3d(opts) {
  if (opts && typeof opts === "object") {
    const normalized = cloneData(opts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "plot3d" }, normalized), emit);
  }
  return finalizeDisplay({ ui: "plot3d" }, true);
}
function UiMap(opts) {
  if (opts && typeof opts === "object") {
    const normalized = cloneData(opts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "map" }, normalized), emit);
  }
  return finalizeDisplay({ ui: "map" }, true);
}
function UiGeoJson(featureOrOpts, opts) {
  if (
    featureOrOpts &&
    typeof featureOrOpts === "object" &&
    !Array.isArray(featureOrOpts) &&
    featureOrOpts.type === "FeatureCollection"
  ) {
    const normalized = cloneData(opts || {});
    const emit = shouldEmit(normalized);
    normalized.featureCollection = featureOrOpts;
    return finalizeDisplay(Object.assign({ ui: "geoJson" }, normalized), emit);
  }
  if (
    !featureOrOpts ||
    typeof featureOrOpts !== "object" ||
    typeof featureOrOpts.featureCollection !== "object"
  ) {
    throw new Error(
      "UiGeoJson expects a GeoJSON FeatureCollection in 'featureCollection'"
    );
  }
  const normalized = cloneData(featureOrOpts);
  const emit = shouldEmit(normalized);
  return finalizeDisplay(Object.assign({ ui: "geoJson" }, normalized), emit);
}
function UiAlert(opts) {
  if (opts && typeof opts === "object") {
    const normalized = cloneData(opts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "alert" }, normalized), emit);
  }
  throw new Error("UiAlert expects an options object");
}
function UiBadge(textOrOpts, opts) {
  if (
    textOrOpts &&
    typeof textOrOpts === "object" &&
    "text" in textOrOpts
  ) {
    const normalized = cloneData(textOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "badge" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.text = String(textOrOpts ?? "");
  return finalizeDisplay(Object.assign({ ui: "badge" }, normalized), emit);
}
function UiMetric(valueOrOpts, opts) {
  if (
    valueOrOpts &&
    typeof valueOrOpts === "object" &&
    "value" in valueOrOpts
  ) {
    const normalized = cloneData(valueOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "metric" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.value = valueOrOpts;
  return finalizeDisplay(Object.assign({ ui: "metric" }, normalized), emit);
}
function UiProgress(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object") {
    const normalized = cloneData(valueOrOpts);
    const emit = shouldEmit(normalized);
    return finalizeDisplay(Object.assign({ ui: "progress" }, normalized), emit);
  }
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  normalized.value = valueOrOpts;
  return finalizeDisplay(Object.assign({ ui: "progress" }, normalized), emit);
}
function UiSpinner(opts) {
  const normalized = cloneData(opts || {});
  const emit = shouldEmit(normalized);
  return finalizeDisplay(Object.assign({ ui: "spinner" }, normalized), emit);
}
function UiContainer(childrenOrOpts, opts) {
  let baseOptions;
  if (Array.isArray(childrenOrOpts)) {
    baseOptions = Object.assign({}, opts || {}, { children: childrenOrOpts });
  } else if (
    childrenOrOpts &&
    typeof childrenOrOpts === "object" &&
    !Array.isArray(childrenOrOpts)
  ) {
    baseOptions = childrenOrOpts;
  } else {
    throw new Error(
      "UiContainer expects an array of children or an options object"
    );
  }
  const normalized = cloneData(baseOptions);
  const childList = Array.isArray(baseOptions.children)
    ? baseOptions.children
    : [];
  normalized.children = childList.map((child) => normalizeChildDisplay(child));
  ensureComponentId(normalized, baseOptions.componentId);
  const emit = shouldEmit(normalized);
  return finalizeDisplay(Object.assign({ ui: "container" }, normalized), emit);
}
function UiButton(opts) {
  if (!opts || typeof opts !== "object") {
    throw new Error("UiButton expects an options object");
  }
  const normalized = cloneData(opts);
  ensureComponentId(normalized, opts.componentId);
  const emit = shouldEmit(normalized);
  if (typeof opts.onClick === "function") {
    const handlerId = registerHandler(opts.onClick, {
      componentId: normalized.componentId,
      event: "click",
    });
    normalized.action = Object.assign(
      { handlerId, event: "click", payload: "none" },
      normalized.action || {}
    );
  }
  if (
    normalized.action &&
    typeof normalized.action === "object" &&
    typeof normalized.action.handlerId === "string"
  ) {
    normalized.action = Object.assign(
      { event: normalized.action.event || "click", payload: "none" },
      normalized.action
    );
  }
  if (!normalized.action || typeof normalized.action.handlerId !== "string") {
    throw new Error(
      "UiButton requires an action handler. Provide onClick or action.handlerId"
    );
  }
  delete normalized.onClick;
  return finalizeDisplay(Object.assign({ ui: "button" }, normalized), emit);
}
function UiSlider(opts) {
  if (!opts || typeof opts !== "object") {
    throw new Error("UiSlider expects an options object");
  }
  const normalized = cloneData(opts);
  ensureComponentId(normalized, opts.componentId);
  const emit = shouldEmit(normalized);
  const attach = (key, eventName) => {
    const incoming = opts[key];
    if (typeof incoming === "function") {
      const handlerId = registerHandler(incoming, {
        componentId: normalized.componentId,
        event: eventName,
      });
      normalized[key] = {
        handlerId,
        event: eventName,
        payload: "value",
      };
      return;
    }
    const existing = normalized[key];
    if (
      existing &&
      typeof existing === "object" &&
      typeof existing.handlerId === "string"
    ) {
      normalized[key] = Object.assign(
        { event: existing.event || eventName, payload: "value" },
        existing
      );
      return;
    }
    if (incoming === undefined) {
      delete normalized[key];
      return;
    }
    throw new Error(
      "UiSlider " + key + " must be a function or an action with handlerId"
    );
  };
  attach("onChange", "change");
  attach("onCommit", "commit");
  return finalizeDisplay(Object.assign({ ui: "slider" }, normalized), emit);
}
function UiTextInput(opts) {
  if (!opts || typeof opts !== "object") {
    throw new Error("UiTextInput expects an options object");
  }
  const normalized = cloneData(opts);
  ensureComponentId(normalized, opts.componentId);
  const emit = shouldEmit(normalized);
  const attach = (key, eventName) => {
    const incoming = opts[key];
    if (typeof incoming === "function") {
      const handlerId = registerHandler(incoming, {
        componentId: normalized.componentId,
        event: eventName,
      });
      normalized[key] = {
        handlerId,
        event: eventName,
        payload: "text",
      };
      return;
    }
    const existing = normalized[key];
    if (
      existing &&
      typeof existing === "object" &&
      typeof existing.handlerId === "string"
    ) {
      normalized[key] = Object.assign(
        { event: existing.event || eventName, payload: "text" },
        existing
      );
      return;
    }
    if (incoming === undefined) {
      delete normalized[key];
      return;
    }
    throw new Error(
      "UiTextInput " + key + " must be a function or an action with handlerId"
    );
  };
  attach("onChange", "change");
  attach("onSubmit", "submit");
  return finalizeDisplay(Object.assign({ ui: "textInput" }, normalized), emit);
}

const aliasEntries = {
  image: UiImage,
  markdown: UiMarkdown,
  html: UiHTML,
  json: UiJSON,
  code: UiCode,
  table: UiTable,
  dataSummary: UiDataSummary,
  vegaLite: UiVegaLite,
  plotly: UiPlotly,
  heatmap: UiHeatmap,
  networkGraph: UiNetworkGraph,
  plot3d: UiPlot3d,
  map: UiMap,
  geoJson: UiGeoJson,
  alert: UiAlert,
  badge: UiBadge,
  metric: UiMetric,
  progress: UiProgress,
  spinner: UiSpinner,
  container: UiContainer,
  button: UiButton,
  slider: UiSlider,
  textInput: UiTextInput,
};

const ui = Object.freeze(Object.assign({}, aliasEntries));

module.exports = Object.assign(
  {
    UiImage,
    UiMarkdown,
    UiHTML,
    UiJSON,
    UiCode,
    UiTable,
    UiDataSummary,
    UiVegaLite,
    UiPlotly,
    UiHeatmap,
    UiNetworkGraph,
    UiPlot3d,
    UiMap,
    UiGeoJson,
    UiAlert,
    UiBadge,
    UiMetric,
    UiProgress,
    UiSpinner,
    UiContainer,
    UiButton,
    UiSlider,
    UiTextInput,
    ui,
  },
  aliasEntries
);
`;
