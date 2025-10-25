"use client";

import React from "react";
import type { UiNetworkGraph } from "@nodebooks/notebook-schema";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import colors from "tailwindcss/colors";
import { useComponentThemeMode } from "./utils";

export type NetworkGraphProps = Omit<UiNetworkGraph, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

type NodeDatum = UiNetworkGraph["nodes"][number] &
  SimulationNodeDatum & {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
  };

type LinkDatum = UiNetworkGraph["links"][number] &
  SimulationLinkDatum<NodeDatum> & {
    source: string | NodeDatum;
    target: string | NodeDatum;
  };

const CANVAS = { width: 1200, height: 800 } as const;
const CANVAS_PADDING = 100;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
};

const createRandomSource = (seed: number) => {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x1a2b3c4d;
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
};

const computeGraphSeed = (
  nodes: UiNetworkGraph["nodes"],
  links: UiNetworkGraph["links"],
  layout: UiNetworkGraph["layout"],
  physics: UiNetworkGraph["physics"]
) => {
  const nodeSignature = nodes
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(
      (node) =>
        `${String(node.id)}:${node.label ?? ""}:${node.group ?? ""}:${node.size ?? ""}:${node.color ?? ""}`
    )
    .join("|");

  const linkSignature = links
    .slice()
    .sort((a, b) => {
      const sourceA = String(a.source);
      const sourceB = String(b.source);
      if (sourceA !== sourceB) return sourceA.localeCompare(sourceB);
      const targetA = String(a.target);
      const targetB = String(b.target);
      if (targetA !== targetB) return targetA.localeCompare(targetB);
      return (a.value ?? 0) - (b.value ?? 0);
    })
    .map((link) => {
      const source = String(link.source);
      const target = String(link.target);
      return `${source}->${target}:${link.value ?? ""}:${link.directed ? "1" : "0"}:${link.color ?? ""}`;
    })
    .join("|");

  const physicsSignature = physics
    ? `${physics.chargeStrength ?? ""}:${physics.linkDistance ?? ""}:${physics.linkStrength ?? ""}`
    : "";

  const layoutSignature = layout ?? "force";
  const combined = `${layoutSignature}|${physicsSignature}|${nodeSignature}|${linkSignature}`;
  const seed = hashString(combined);
  return seed === 0 ? 0x9e3779b9 : seed;
};

const prepareLayout = (
  nodes: UiNetworkGraph["nodes"],
  links: UiNetworkGraph["links"],
  physics: UiNetworkGraph["physics"],
  layout: UiNetworkGraph["layout"]
) => {
  const nodeCopies: NodeDatum[] = nodes.map((n) => ({ ...n }));
  const linkCopies: LinkDatum[] = links.map((l) => ({ ...l }));

  const seed = computeGraphSeed(nodes, links, layout, physics);
  const randomSource = createRandomSource(seed);

  if (layout === "circular" && nodeCopies.length > 0) {
    const radius = Math.min(CANVAS.width, CANVAS.height) / 2.3 - CANVAS_PADDING;
    nodeCopies.forEach((node, idx) => {
      const angle = (idx / nodeCopies.length) * Math.PI * 2;
      node.x = CANVAS.width / 2 + Math.cos(angle) * radius;
      node.y = CANVAS.height / 2 + Math.sin(angle) * radius;
    });
  }

  if (layout === "grid" && nodeCopies.length > 0) {
    const cols = Math.ceil(Math.sqrt(nodeCopies.length));
    const gap = Math.max(110, (CANVAS.width - CANVAS_PADDING * 2) / cols);
    nodeCopies.forEach((node, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      node.x = CANVAS_PADDING + col * gap;
      node.y = CANVAS_PADDING + row * gap;
    });
  }

  const simulation = forceSimulation<NodeDatum>(nodeCopies)
    .randomSource(randomSource)
    .force(
      "charge",
      forceManyBody<NodeDatum>().strength(physics?.chargeStrength ?? -5000)
    )
    .force(
      "link",
      forceLink<NodeDatum, LinkDatum>(linkCopies)
        .id((d: NodeDatum) => d.id)
        .distance(physics?.linkDistance ?? 600)
        .strength(physics?.linkStrength ?? 0.05)
    )
    .force(
      "collision",
      forceCollide<NodeDatum>()
        .radius((d) => Math.max(100, (d.size ?? 30) + 60))
        .strength(1)
    )
    .force("center", forceCenter(CANVAS.width / 2, CANVAS.height / 2))
    .stop();

  for (let i = 0; i < 2000; i++) simulation.tick();

  const nodesWithPos = nodeCopies.map((node) => ({
    ...node,
    x: node.x ?? 0,
    y: node.y ?? 0,
  }));

  const extent = nodesWithPos.reduce(
    (
      acc,
      node
    ): {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } => ({
      minX: Math.min(acc.minX, node.x ?? 0),
      minY: Math.min(acc.minY, node.y ?? 0),
      maxX: Math.max(acc.maxX, node.x ?? 0),
      maxY: Math.max(acc.maxY, node.y ?? 0),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  const rangeX = extent.maxX - extent.minX || 1;
  const rangeY = extent.maxY - extent.minY || 1;
  const scale = Math.min(
    (CANVAS.width - CANVAS_PADDING * 2) / rangeX,
    (CANVAS.height - CANVAS_PADDING * 2) / rangeY,
    0.8
  );

  const scaledNodes = nodesWithPos.map((node) => ({
    ...node,
    x: CANVAS_PADDING + (node.x - extent.minX) * scale,
    y: CANVAS_PADDING + (node.y - extent.minY) * scale,
  }));

  const nodeById = new Map(scaledNodes.map((n) => [n.id, n] as const));
  const scaledLinks = linkCopies
    .map((link) => {
      // After simulation, source/target may be node objects or strings
      const sourceId =
        typeof link.source === "string"
          ? link.source
          : (link.source as NodeDatum).id;
      const targetId =
        typeof link.target === "string"
          ? link.target
          : (link.target as NodeDatum).id;
      const source = nodeById.get(sourceId);
      const target = nodeById.get(targetId);
      if (!source || !target) return null;
      return {
        value: link.value,
        directed: link.directed,
        color: link.color,
        source,
        target,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  return {
    nodes: scaledNodes,
    links: scaledLinks,
    viewBox: [0, 0, CANVAS.width, CANVAS.height] as const,
  };
};

const buildLinkColor = (mode: "light" | "dark", color?: string) => {
  if (color) return color;
  return mode === "light" ? "rgba(100,116,139,0.65)" : "rgba(148,163,184,0.7)";
};

const buildNodeFill = (mode: "light" | "dark", color?: string) => {
  if (color) return color;
  return mode === "light" ? colors.sky[500] : colors.sky[400];
};

const buildNodeStroke = (mode: "light" | "dark") =>
  mode === "light" ? "rgba(15,23,42,0.18)" : "rgba(226,232,240,0.35)";

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  nodes,
  links,
  physics,
  layout = "force",
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const [isMounted, setIsMounted] = React.useState(false);
  const markerId = React.useId();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = React.useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: 0,
    y: 0,
    width: CANVAS.width,
    height: CANVAS.height,
  });
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = React.useState<string | null>(null);
  const [nodePositions, setNodePositions] = React.useState<
    Map<string, { x: number; y: number }>
  >(new Map());

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const prepared = React.useMemo(
    () =>
      isMounted
        ? prepareLayout(nodes, links, physics, layout)
        : {
            nodes: nodes.map((node, index) => ({
              ...node,
              x:
                CANVAS.width / 2 +
                Math.cos((index / Math.max(nodes.length, 1)) * Math.PI * 2) *
                  120,
              y:
                CANVAS.height / 2 +
                Math.sin((index / Math.max(nodes.length, 1)) * Math.PI * 2) *
                  120,
            })),
            links: [],
            viewBox: [0, 0, CANVAS.width, CANVAS.height] as const,
          },
    [isMounted, nodes, links, physics, layout]
  );

  // Initialize node positions when prepared layout changes
  React.useEffect(() => {
    if (!isMounted) return;
    const positions = new Map<string, { x: number; y: number }>();
    prepared.nodes.forEach((node) => {
      positions.set(node.id, { x: node.x, y: node.y });
    });
    setNodePositions(positions);
  }, [isMounted, prepared]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNode) return; // Don't pan while dragging a node
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNode) {
      // Handle node dragging
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;
      const x = viewBox.x + (e.clientX - rect.left) * scaleX;
      const y = viewBox.y + (e.clientY - rect.top) * scaleY;
      setNodePositions((prev) => {
        const newPositions = new Map(prev);
        newPositions.set(draggedNode, { x, y });
        return newPositions;
      });
      return;
    }

    if (!isPanning) return;
    const dx =
      (e.clientX - panStart.x) *
      (viewBox.width / (svgRef.current?.clientWidth || CANVAS.width));
    const dy =
      (e.clientY - panStart.y) *
      (viewBox.height / (svgRef.current?.clientHeight || CANVAS.height));
    setViewBox((prev) => ({
      ...prev,
      x: prev.x - dx,
      y: prev.y - dy,
    }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNode(nodeId);
  };

  const handleReset = () => {
    setViewBox({
      x: 0,
      y: 0,
      width: CANVAS.width,
      height: CANVAS.height,
    });
  };

  const handleZoomIn = () => {
    const scaleFactor = 0.8;
    const newWidth = viewBox.width * scaleFactor;
    const newHeight = viewBox.height * scaleFactor;
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    setViewBox({
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
  };

  const handleZoomOut = () => {
    const scaleFactor = 1.25;
    const newWidth = viewBox.width * scaleFactor;
    const newHeight = viewBox.height * scaleFactor;
    const centerX = viewBox.x + viewBox.width / 2;
    const centerY = viewBox.y + viewBox.height / 2;
    setViewBox({
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
  };

  if (nodes.length === 0) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm ${className ?? ""}`}
      >
        Network graph has no nodes.
      </div>
    );
  }

  if (!isMounted) {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ""}`}
        role="group"
        aria-label="Network graph (loading)"
      >
        <div className="flex h-[360px] w-full items-center justify-center text-sm text-muted-foreground">
          Preparing graph…
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm ${className ?? ""}`}
      role="group"
      aria-label="Network graph"
    >
      <div className="absolute right-6 top-6 z-20 flex gap-1">
        <button
          onClick={handleZoomIn}
          className="rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:bg-background/90 hover:text-foreground"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:bg-background/90 hover:text-foreground"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:bg-background/90 hover:text-foreground"
          title="Reset view"
        >
          Reset
        </button>
      </div>
      <div
        className="relative mx-auto overflow-hidden rounded-lg"
        style={{ height: "420px", maxWidth: "720px" }}
        onWheel={(e) => e.stopPropagation()}
      >
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="420"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            display: "block",
            cursor: draggedNode ? "grabbing" : isPanning ? "grabbing" : "grab",
            background:
              mode === "light" ? "rgba(248,250,252,0.4)" : "rgba(15,23,42,0.6)",
          }}
        >
          <defs>
            <marker
              id={`${markerId}-arrowhead`}
              markerWidth="12"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0 0 L12 4 L0 8 Z"
                fill={mode === "light" ? colors.sky[500] : colors.sky[400]}
              />
            </marker>
          </defs>

          {prepared.links.map((link, idx) => {
            if (!link) return null;
            const sourcePos = nodePositions.get(link.source.id) || {
              x: link.source.x ?? 0,
              y: link.source.y ?? 0,
            };
            const targetPos = nodePositions.get(link.target.id) || {
              x: link.target.x ?? 0,
              y: link.target.y ?? 0,
            };
            return (
              <g key={idx} opacity={0.92}>
                <line
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke={buildLinkColor(mode, link.color)}
                  strokeWidth={Math.max(1.4, (link.value ?? 1) * 1.25)}
                  strokeLinecap="round"
                  markerEnd={
                    link.directed ? `url(#${markerId}-arrowhead)` : undefined
                  }
                />
              </g>
            );
          })}

          {prepared.nodes.map((node) => {
            const radius = Math.max(20, node.size ?? 18);
            const fill = buildNodeFill(mode, node.color);
            const stroke = buildNodeStroke(mode);
            const label = node.label ?? node.id;
            const pos = nodePositions.get(node.id) || {
              x: node.x ?? 0,
              y: node.y ?? 0,
            };
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <circle
                  r={radius}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                  opacity={0.95}
                  style={{ cursor: "move" }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                />
                <text
                  x={0}
                  y={radius + 20}
                  textAnchor="middle"
                  className="fill-[color:var(--muted-foreground)] text-xs font-medium tracking-tight"
                  style={{ pointerEvents: "none" }}
                >
                  {label}
                </text>
                <title>{label}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
