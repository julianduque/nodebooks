export const uiHelpersModuleJs = String.raw`"use strict";
const DISPLAY_ID = Symbol("nodebooks.ui.displayId");
let displayCounter = 0;

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
    return __nb_emit(Object.assign({ ui: "image" }, srcOrOpts));
  }
  return __nb_emit(
    Object.assign({ ui: "image", src: srcOrOpts }, opts || {})
  );
}
function UiMarkdown(markdown) {
  return __nb_emit({ ui: "markdown", markdown });
}
function UiHTML(html) {
  return __nb_emit({ ui: "html", html });
}
function UiJSON(json, opts) {
  return __nb_emit(Object.assign({ ui: "json", json }, opts || {}));
}
function UiCode(code, opts) {
  return __nb_emit(Object.assign({ ui: "code", code }, opts || {}));
}
function UiTable(rowsOrOpts, opts) {
  if (Array.isArray(rowsOrOpts)) {
    return __nb_emit(
      Object.assign({ ui: "table", rows: rowsOrOpts }, opts || {})
    );
  }
  if (
    rowsOrOpts &&
    typeof rowsOrOpts === "object" &&
    "rows" in rowsOrOpts
  ) {
    return __nb_emit(Object.assign({ ui: "table" }, rowsOrOpts));
  }
  throw new Error(
    "UiTable expects an array of rows or an options object with { rows }"
  );
}
function UiDataSummary(opts) {
  if (opts && typeof opts === "object") {
    return __nb_emit(Object.assign({ ui: "dataSummary" }, opts));
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
    return __nb_emit(Object.assign({ ui: "vegaLite" }, specOrOpts));
  }
  if (!specOrOpts || typeof specOrOpts !== "object") {
    throw new Error("UiVegaLite expects a spec object");
  }
  return __nb_emit(
    Object.assign({ ui: "vegaLite", spec: specOrOpts }, opts || {})
  );
}
function UiPlotly(dataOrOpts, opts) {
  if (Array.isArray(dataOrOpts)) {
    return __nb_emit(
      Object.assign({ ui: "plotly", data: dataOrOpts }, opts || {})
    );
  }
  if (
    !dataOrOpts ||
    typeof dataOrOpts !== "object" ||
    !Array.isArray(dataOrOpts.data)
  ) {
    throw new Error("UiPlotly expects an array of traces in 'data'");
  }
  return __nb_emit(Object.assign({ ui: "plotly" }, dataOrOpts));
}
function UiHeatmap(valuesOrOpts, opts) {
  if (Array.isArray(valuesOrOpts)) {
    return __nb_emit(
      Object.assign({ ui: "heatmap", values: valuesOrOpts }, opts || {})
    );
  }
  if (
    !valuesOrOpts ||
    typeof valuesOrOpts !== "object" ||
    !Array.isArray(valuesOrOpts.values)
  ) {
    throw new Error("UiHeatmap expects a 2D number array in 'values'");
  }
  return __nb_emit(Object.assign({ ui: "heatmap" }, valuesOrOpts));
}
function UiNetworkGraph(nodesOrOpts, links, opts) {
  if (Array.isArray(nodesOrOpts) && Array.isArray(links)) {
    return __nb_emit(
      Object.assign(
        { ui: "networkGraph", nodes: nodesOrOpts, links },
        opts || {}
      )
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
  return __nb_emit(Object.assign({ ui: "networkGraph" }, nodesOrOpts));
}
function UiPlot3d(opts) {
  if (opts && typeof opts === "object") {
    return __nb_emit(Object.assign({ ui: "plot3d" }, opts));
  }
  return __nb_emit({ ui: "plot3d" });
}
function UiMap(opts) {
  if (opts && typeof opts === "object") {
    return __nb_emit(Object.assign({ ui: "map" }, opts));
  }
  return __nb_emit({ ui: "map" });
}
function UiGeoJson(featureOrOpts, opts) {
  if (
    featureOrOpts &&
    typeof featureOrOpts === "object" &&
    !Array.isArray(featureOrOpts) &&
    featureOrOpts.type === "FeatureCollection"
  ) {
    return __nb_emit(
      Object.assign(
        { ui: "geoJson", featureCollection: featureOrOpts },
        opts || {}
      )
    );
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
  return __nb_emit(Object.assign({ ui: "geoJson" }, featureOrOpts));
}
function UiAlert(opts) {
  if (opts && typeof opts === "object") {
    return __nb_emit(Object.assign({ ui: "alert" }, opts));
  }
  throw new Error("UiAlert expects an options object");
}
function UiBadge(textOrOpts, opts) {
  if (
    textOrOpts &&
    typeof textOrOpts === "object" &&
    "text" in textOrOpts
  ) {
    return __nb_emit(Object.assign({ ui: "badge" }, textOrOpts));
  }
  return __nb_emit(
    Object.assign(
      { ui: "badge", text: String(textOrOpts ?? "") },
      opts || {}
    )
  );
}
function UiMetric(valueOrOpts, opts) {
  if (
    valueOrOpts &&
    typeof valueOrOpts === "object" &&
    "value" in valueOrOpts
  ) {
    return __nb_emit(Object.assign({ ui: "metric" }, valueOrOpts));
  }
  return __nb_emit(
    Object.assign({ ui: "metric", value: valueOrOpts }, opts || {})
  );
}
function UiProgress(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object") {
    return __nb_emit(Object.assign({ ui: "progress" }, valueOrOpts));
  }
  return __nb_emit(
    Object.assign({ ui: "progress", value: valueOrOpts }, opts || {})
  );
}
function UiSpinner(opts) {
  if (opts && typeof opts === "object") {
    return __nb_emit(Object.assign({ ui: "spinner" }, opts));
  }
  return __nb_emit({ ui: "spinner" });
}

module.exports = {
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
};
`;
