"use client";

import React from "react";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection,
  Point,
} from "geojson";
import type {
  Map as MapInstance,
  Marker,
  NavigationControl,
  Popup,
  StyleSpecification,
} from "maplibre-gl";
import type { UiMap, UiGeoJson } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

type MaplibreModule = {
  Map: new (...args: unknown[]) => MapInstance;
  Marker: new (...args: unknown[]) => Marker;
  Popup: new (...args: unknown[]) => Popup;
  NavigationControl: new (...args: unknown[]) => NavigationControl;
};

type MapProps = Omit<UiMap, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

type GeoJsonProps = Omit<UiGeoJson, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

type GeoJsonMapStyle = NonNullable<UiGeoJson["map"]>["style"];
type GenericFeature = Feature<Geometry, Record<string, unknown>>;
type GenericFeatureCollection = FeatureCollection<
  Geometry,
  Record<string, unknown>
>;

const MAP_CONTAINER_CSS = `
.maplibregl-map { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 0.5rem; font: 12px/20px "Helvetica Neue", Arial, Helvetica, sans-serif; }
.maplibregl-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.maplibregl-control-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
.maplibregl-ctrl-top-right { position: absolute; top: 0.75rem; right: 0.75rem; pointer-events: auto; }
.maplibregl-ctrl-bottom-left { position: absolute; bottom: 0.5rem; left: 0.5rem; pointer-events: auto; }
.maplibregl-ctrl-attrib-inner { font-size: 11px; background: rgba(15, 23, 42, 0.55); color: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
.maplibregl-marker { position: absolute; top: 0; left: 0; will-change: transform; transition: opacity 0.2s ease; cursor: pointer; }
.maplibregl-popup { position: absolute; top: 0; left: 0; display: flex; pointer-events: none; will-change: transform; z-index: 3; }
.maplibregl-popup-content { background: #fff; color: #0f172a; border-radius: 0.375rem; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25); pointer-events: auto; padding: 0.75rem 0.875rem; max-width: 240px; }
.maplibregl-popup-tip { width: 0; height: 0; border: 10px solid transparent; z-index: 1; }
.maplibregl-popup-anchor-top, .maplibregl-popup-anchor-top-left, .maplibregl-popup-anchor-top-right { flex-direction: column; }
.maplibregl-popup-anchor-bottom, .maplibregl-popup-anchor-bottom-left, .maplibregl-popup-anchor-bottom-right { flex-direction: column-reverse; }
.maplibregl-popup-anchor-left { flex-direction: row; }
.maplibregl-popup-anchor-right { flex-direction: row-reverse; }
.maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: #fff; border-top: none; align-self: center; }
.maplibregl-popup-anchor-top-left .maplibregl-popup-tip { border-bottom-color: #fff; border-left: none; border-top: none; align-self: flex-start; }
.maplibregl-popup-anchor-top-right .maplibregl-popup-tip { border-bottom-color: #fff; border-right: none; border-top: none; align-self: flex-end; }
.maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-bottom: none; border-top-color: #fff; align-self: center; }
.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip { border-bottom: none; border-top-color: #fff; border-left: none; align-self: flex-start; }
.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip { border-bottom: none; border-top-color: #fff; border-right: none; align-self: flex-end; }
.maplibregl-popup-anchor-left .maplibregl-popup-tip { border-left: none; border-right-color: #fff; align-self: center; }
.maplibregl-popup-anchor-right .maplibregl-popup-tip { border-right: none; border-left-color: #fff; align-self: center; }
`;

const ensureCssInjected = () => {
  if (typeof document === "undefined") return () => {};
  const existing = document.querySelector<HTMLStyleElement>(
    "style[data-nodebooks-maplibre]"
  );
  if (existing) {
    return () => {};
  }
  const style = document.createElement("style");
  style.dataset.nodebooksMaplibre = "true";
  style.textContent = MAP_CONTAINER_CSS;
  document.head.appendChild(style);
  return () => {};
};

const rasterLayer = (
  tiles: string[],
  attribution: string,
  adjustments?: Partial<{
    saturation: number;
    brightnessMin: number;
    brightnessMax: number;
  }>
) =>
  ({
    version: 8 as const,
    sources: {
      "raster-tiles": {
        type: "raster" as const,
        tiles,
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: "base",
        type: "raster" as const,
        source: "raster-tiles",
        paint: {
          "raster-saturation": adjustments?.saturation ?? 0,
          "raster-brightness-min": Math.max(
            0,
            Math.min(adjustments?.brightnessMin ?? 0, 1)
          ),
          "raster-brightness-max": Math.max(
            0,
            Math.min(adjustments?.brightnessMax ?? 1, 1)
          ),
        },
      },
    ],
  }) satisfies StyleSpecification;

const STYLE_PRESETS = {
  streets: rasterLayer(
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    "© OpenStreetMap contributors"
  ),
  light: rasterLayer(
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    "© OpenStreetMap contributors",
    { brightnessMin: 0.8, brightnessMax: 1.15 }
  ),
  dark: rasterLayer(
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    "© OpenStreetMap contributors",
    { brightnessMin: 0.2, brightnessMax: 0.8, saturation: -0.9 }
  ),
  outdoors: rasterLayer(
    ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    "© OpenStreetMap contributors"
  ),
  terrain: rasterLayer(
    ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    "© OpenTopoMap (CC-BY-SA)",
    { brightnessMin: 0.7, brightnessMax: 1.1 }
  ),
  satellite: rasterLayer(
    [
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    "Tiles © Esri & partners",
    { brightnessMin: 0.5, brightnessMax: 1.1 }
  ),
} as const;

const toFeatureCollection = (
  data: UiGeoJson["featureCollection"]
): GenericFeatureCollection => data as unknown as GenericFeatureCollection;

const isPointFeature = (
  feature: GenericFeature
): feature is Feature<Point, Record<string, unknown>> =>
  feature.geometry.type === "Point";

const computeGeoBounds = (featureCollection: GenericFeatureCollection) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const processCoords = (coords: unknown) => {
    if (Array.isArray(coords)) {
      if (
        coords.length === 2 &&
        typeof coords[0] === "number" &&
        typeof coords[1] === "number"
      ) {
        const [lng, lat] = coords as [number, number];
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      } else {
        coords.forEach(processCoords);
      }
    }
  };

  const walkGeometry = (geometry: Geometry) => {
    if (geometry.type === "GeometryCollection") {
      (geometry as GeometryCollection).geometries.forEach(walkGeometry);
      return;
    }
    const geomWithCoords = geometry as Exclude<Geometry, GeometryCollection> & {
      coordinates: unknown;
    };
    processCoords(geomWithCoords.coordinates);
  };

  featureCollection.features.forEach((feature) => {
    walkGeometry(feature.geometry);
  });

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  const bounds: [[number, number], [number, number]] = [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
  return bounds;
};

const maybeResolveStyle = (style: UiMap["style"] | GeoJsonMapStyle) => {
  if (!style) {
    return JSON.parse(
      JSON.stringify(STYLE_PRESETS.streets)
    ) as StyleSpecification;
  }
  if (
    typeof style === "string" &&
    STYLE_PRESETS[style as keyof typeof STYLE_PRESETS]
  ) {
    return JSON.parse(
      JSON.stringify(STYLE_PRESETS[style as keyof typeof STYLE_PRESETS])
    ) as StyleSpecification;
  }
  if (typeof style === "string") return style;
  return JSON.parse(JSON.stringify(style)) as StyleSpecification;
};

const paddingToOptions = (
  padding: UiMap["bounds"] extends infer T
    ? T extends { padding?: infer P }
      ? P
      : number | undefined
    : number | undefined
) => {
  if (typeof padding === "number") return padding;
  if (Array.isArray(padding)) {
    const [top, right, bottom, left] = padding;
    return { top, right, bottom, left } as const;
  }
  return 24;
};

const useBaseMap = (
  options: {
    center?: [number, number];
    zoom?: number;
    pitch?: number;
    bearing?: number;
    style: UiMap["style"] | GeoJsonMapStyle;
    attribution?: string;
    bounds?: UiMap["bounds"];
  },
  onLoad: (map: MapInstance, lib: MaplibreModule) => void,
  dependencies: React.DependencyList
) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let map: MapInstance | null = null;
    let cleanupCss = () => {};
    let resizeObserver: ResizeObserver | undefined;

    const mount = async () => {
      try {
        const imported = await import("maplibre-gl");
        const maplibre = (imported.default ?? imported) as MaplibreModule;
        cleanupCss = ensureCssInjected();
        if (!containerRef.current) return;
        const style = maybeResolveStyle(options.style);
        const createdMap = new maplibre.Map({
          container: containerRef.current,
          style,
          center: options.center ?? [0, 30],
          zoom: options.zoom ?? 1.8,
          pitch: options.pitch ?? 0,
          bearing: options.bearing ?? 0,
          attributionControl: false,
        }) as MapInstance;

        map = createdMap;

        createdMap.addControl(
          new maplibre.NavigationControl({ showZoom: true }),
          "top-right"
        );
        createdMap.on("load", () => {
          onLoad(createdMap, maplibre);
          if (options.bounds) {
            createdMap.fitBounds([options.bounds.sw, options.bounds.ne], {
              padding: paddingToOptions(options.bounds.padding),
            });
          }
          createdMap.resize();
        });
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            map?.resize();
          });
          resizeObserver.observe(containerRef.current);
        }
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unable to initialise map"
        );
      }
    };

    mount();

    return () => {
      if (map) {
        map.remove();
      }
      resizeObserver?.disconnect();
      cleanupCss();
    };
  }, dependencies);

  return { containerRef, error } as const;
};

export const MapView: React.FC<MapProps> = ({
  center,
  zoom,
  pitch,
  bearing,
  bounds,
  style,
  geojson,
  attribution,
  markers,
  height,
  themeMode,
  className,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const markerInstances = React.useRef<Marker[]>([]);
  const sourceId = React.useId();
  const mapHeight = height ?? 320;

  React.useEffect(() => {
    return () => {
      markerInstances.current.forEach((marker) => marker.remove());
      markerInstances.current = [];
    };
  }, []);

  const { containerRef, error } = useBaseMap(
    { center, zoom, pitch, bearing, bounds, style, attribution },
    (map, lib) => {
      markerInstances.current.forEach((marker) => marker.remove());
      markerInstances.current = [];

      if (markers) {
        markers.forEach((marker: NonNullable<UiMap["markers"]>[number]) => {
          const color =
            marker.color ?? (mode === "light" ? "#0ea5e9" : "#38bdf8");
          const popup = marker.popup
            ? new lib.Popup({ offset: 12 }).setHTML(marker.popup)
            : undefined;
          const instance = new lib.Marker({ color })
            .setLngLat(marker.coordinates)
            .setPopup(popup ?? undefined)
            .addTo(map);
          markerInstances.current.push(instance);
        });
      }

      if (geojson) {
        const fc = toFeatureCollection(geojson);
        if (map.getSource(sourceId)) {
          const layers = [
            `${sourceId}-fill`,
            `${sourceId}-line`,
            `${sourceId}-points`,
          ];
          layers.forEach((layerId) => {
            if (map.getLayer(layerId)) {
              map.removeLayer(layerId);
            }
          });
          map.removeSource(sourceId);
        }
        map.addSource(sourceId, {
          type: "geojson",
          data: fc,
        });
        map.addLayer({
          id: `${sourceId}-fill`,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": mode === "light" ? "#38bdf8" : "#60a5fa",
            "fill-opacity": 0.25,
          },
          filter: ["==", ["geometry-type"], "Polygon"],
        });
        map.addLayer({
          id: `${sourceId}-line`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": mode === "light" ? "#0284c7" : "#bae6fd",
            "line-width": 2,
          },
          filter: [
            "any",
            ["==", ["geometry-type"], "Polygon"],
            ["==", ["geometry-type"], "LineString"],
          ],
        });
        map.addLayer({
          id: `${sourceId}-points`,
          type: "circle",
          source: sourceId,
          paint: {
            "circle-color": mode === "light" ? "#0f172a" : "#f8fafc",
            "circle-radius": 5,
            "circle-stroke-color": mode === "light" ? "#38bdf8" : "#0284c7",
            "circle-stroke-width": 1.5,
          },
          filter: ["==", ["geometry-type"], "Point"],
        });
      }
    },
    [
      center,
      zoom,
      pitch,
      bearing,
      bounds,
      style,
      geojson,
      markers,
      mode,
      mapHeight,
    ]
  );

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      {error ? (
        <div className="text-red-500">Failed to render map: {error}</div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ height: mapHeight }}
        />
      )}
      <div className="mt-2 text-[11px] text-slate-500">
        {attribution ?? "Map data © OpenStreetMap contributors"}
      </div>
    </div>
  );
};

export const GeoJsonMap: React.FC<GeoJsonProps> = ({
  featureCollection,
  map,
  fillColor,
  lineColor,
  lineWidth,
  opacity,
  showMarkers = true,
  height,
  themeMode,
  className,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const markerInstances = React.useRef<Marker[]>([]);
  const sourceId = React.useId();
  const mapHeight = height ?? 320;

  React.useEffect(() => {
    return () => {
      markerInstances.current.forEach((marker) => marker.remove());
      markerInstances.current = [];
    };
  }, []);

  const { containerRef, error } = useBaseMap(
    {
      center: map?.center,
      zoom: map?.zoom,
      style: map?.style,
      attribution: map?.attribution,
    },
    (mapInstance, lib) => {
      markerInstances.current.forEach((marker) => marker.remove());
      markerInstances.current = [];

      if (mapInstance.getSource(sourceId)) {
        [`${sourceId}-fill`, `${sourceId}-line`, `${sourceId}-points`].forEach(
          (layerId) => {
            if (mapInstance.getLayer(layerId)) {
              mapInstance.removeLayer(layerId);
            }
          }
        );
        mapInstance.removeSource(sourceId);
      }

      const fc = toFeatureCollection(featureCollection);

      mapInstance.addSource(sourceId, {
        type: "geojson",
        data: fc,
      });

      mapInstance.addLayer({
        id: `${sourceId}-fill`,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": fillColor ?? (mode === "light" ? "#22d3ee" : "#38bdf8"),
          "fill-opacity": opacity ?? 0.35,
        },
        filter: ["==", ["geometry-type"], "Polygon"],
      });

      mapInstance.addLayer({
        id: `${sourceId}-line`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": lineColor ?? (mode === "light" ? "#0ea5e9" : "#bae6fd"),
          "line-width": lineWidth ?? 2,
        },
        filter: [
          "any",
          ["==", ["geometry-type"], "Polygon"],
          ["==", ["geometry-type"], "LineString"],
        ],
      });

      if (showMarkers) {
        fc.features.filter(isPointFeature).forEach((feature) => {
          const coords = feature.geometry.coordinates;
          const [lng, lat] = coords;
          const popupContent = feature.properties?.popup
            ? String(feature.properties.popup)
            : undefined;
          const popup = popupContent
            ? new lib.Popup({ offset: 12 }).setText(popupContent)
            : undefined;
          const marker = new lib.Marker({
            color: mode === "light" ? "#0f172a" : "#f8fafc",
          })
            .setLngLat([lng, lat])
            .setPopup(popup ?? undefined)
            .addTo(mapInstance);
          markerInstances.current.push(marker);
        });
      }

      const bounds = computeGeoBounds(fc);
      if (!map?.center && bounds) {
        mapInstance.fitBounds(bounds, { padding: 40 });
      }
    },
    [
      featureCollection,
      map,
      fillColor,
      lineColor,
      lineWidth,
      opacity,
      showMarkers,
      mode,
      mapHeight,
    ]
  );

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      {error ? (
        <div className="text-red-500">
          Failed to render GeoJSON layer: {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ height: mapHeight }}
        />
      )}
      <div className="mt-2 text-[11px] text-slate-500">
        {map?.attribution ?? "Map data © OpenStreetMap contributors"}
      </div>
    </div>
  );
};
