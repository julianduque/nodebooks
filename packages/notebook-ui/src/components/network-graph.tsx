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
import { UiThemeContext } from "./theme";

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

const LAYOUT_DEFAULT_SIZE = { width: 640, height: 420 };

const prepareLayout = (
  nodes: UiNetworkGraph["nodes"],
  links: UiNetworkGraph["links"],
  physics: UiNetworkGraph["physics"],
  layout: UiNetworkGraph["layout"]
) => {
  const nodeCopies: NodeDatum[] = nodes.map((n) => ({ ...n }));
  const linkCopies: LinkDatum[] = links.map((l) => ({ ...l }));

  if (layout === "circular" && nodeCopies.length > 0) {
    const radius =
      Math.min(LAYOUT_DEFAULT_SIZE.width, LAYOUT_DEFAULT_SIZE.height) / 2.8;
    nodeCopies.forEach((node, idx) => {
      const angle = (idx / nodeCopies.length) * Math.PI * 2;
      node.x = Math.cos(angle) * radius + LAYOUT_DEFAULT_SIZE.width / 2;
      node.y = Math.sin(angle) * radius + LAYOUT_DEFAULT_SIZE.height / 2;
    });
  }

  if (layout === "grid" && nodeCopies.length > 0) {
    const cols = Math.ceil(Math.sqrt(nodeCopies.length));
    const gap = 90;
    nodeCopies.forEach((node, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      node.x = col * gap + gap;
      node.y = row * gap + gap;
    });
  }

  const simulation = forceSimulation<NodeDatum>(nodeCopies)
    .force(
      "charge",
      forceManyBody<NodeDatum>().strength(physics?.chargeStrength ?? -120)
    )
    .force(
      "link",
      forceLink<NodeDatum, LinkDatum>(linkCopies)
        .id((d) => d.id)
        .distance(physics?.linkDistance ?? 80)
        .strength(physics?.linkStrength ?? 0.1)
    )
    .force(
      "collision",
      forceCollide<NodeDatum>().radius((d) => Math.max(16, (d.size ?? 12) + 6))
    )
    .force(
      "center",
      forceCenter(LAYOUT_DEFAULT_SIZE.width / 2, LAYOUT_DEFAULT_SIZE.height / 2)
    )
    .stop();

  for (let i = 0; i < 300; i++) simulation.tick();

  const nodesWithPos = nodeCopies.map((node) => ({
    ...node,
    x: node.x ?? 0,
    y: node.y ?? 0,
  }));

  const nodeById = new Map(nodesWithPos.map((n) => [n.id, n] as const));
  const linksWithPos = linkCopies
    .map((link) => {
      const source =
        typeof link.source === "string"
          ? nodeById.get(link.source)
          : (link.source as NodeDatum | undefined);
      const target =
        typeof link.target === "string"
          ? nodeById.get(link.target)
          : (link.target as NodeDatum | undefined);
      if (!source || !target) return null;
      return {
        ...link,
        source,
        target,
      };
    })
    .filter(
      (
        l
      ): l is {
        source: NodeDatum;
        target: NodeDatum;
        value?: number;
        directed?: boolean;
        color?: string;
      } => Boolean(l)
    );

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

  const padding = 60;
  const width = Math.max(
    LAYOUT_DEFAULT_SIZE.width,
    extent.maxX - extent.minX + padding * 2
  );
  const height = Math.max(
    LAYOUT_DEFAULT_SIZE.height,
    extent.maxY - extent.minY + padding * 2
  );

  return {
    nodes: nodesWithPos,
    links: linksWithPos,
    viewBox: [
      extent.minX - padding,
      extent.minY - padding,
      width,
      height,
    ] as const,
  };
};

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  nodes,
  links,
  physics,
  layout = "force",
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const markerId = React.useId();

  const prepared = React.useMemo(
    () => prepareLayout(nodes, links, physics, layout),
    [nodes, links, physics, layout]
  );

  if (nodes.length === 0) {
    return (
      <div
        className={`rounded-md border p-3 text-sm ${className ?? ""} ${
          mode === "light"
            ? "border-slate-200 bg-slate-100 text-slate-500"
            : "border-slate-800 bg-slate-900 text-slate-300"
        }`}
      >
        Network graph has no nodes.
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      <svg
        viewBox={prepared.viewBox.join(" ")}
        className="h-auto w-full"
        role="img"
        aria-label="Network graph"
      >
        <defs>
          <marker
            id={`${markerId}-arrowhead`}
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={mode === "light" ? "#1d4ed8" : "#38bdf8"}
            />
          </marker>
        </defs>
        {prepared.links.map((link, idx) => (
          <line
            key={idx}
            x1={link.source.x ?? 0}
            y1={link.source.y ?? 0}
            x2={link.target.x ?? 0}
            y2={link.target.y ?? 0}
            stroke={link.color ?? (mode === "light" ? "#94a3b8" : "#64748b")}
            strokeWidth={(link.value ?? 1) * 1.5}
            opacity={0.85}
            markerEnd={
              link.directed ? `url(#${markerId}-arrowhead)` : undefined
            }
          />
        ))}
        {prepared.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
          >
            <circle
              r={Math.max(12, node.size ?? 12)}
              fill={node.color ?? (mode === "light" ? "#1d4ed8" : "#38bdf8")}
              opacity={0.9}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={12}
              fill={mode === "light" ? "#f8fafc" : "#0f172a"}
              fontWeight={600}
            >
              {node.label ?? node.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
