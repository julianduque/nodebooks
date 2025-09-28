"use client";

import React from "react";
import type { BufferAttribute, Material, Object3D } from "three";
import type { UiPlot3d } from "@nodebooks/notebook-schema";
import { UiThemeContext } from "./theme";
import { sampleColorRgb } from "./color-scales";

export type Plot3dProps = Omit<UiPlot3d, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

const computeSurfaceExtent = (values: number[][]) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const row of values) {
    for (const value of row) {
      if (Number.isFinite(value)) {
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = -1;
    max = 1;
  }
  if (min === max) {
    max = min + 1;
  }
  return { min, max };
};

export const Plot3dScene: React.FC<Plot3dProps> = ({
  points,
  lines,
  surface,
  camera,
  background,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    const mount = async () => {
      try {
        const THREE = await import("three");
        const controlsModule = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );
        if (!mounted || !containerRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(
          background ?? (mode === "light" ? "#ffffff" : "#020617")
        );
        const width = containerRef.current.clientWidth || 640;
        const height = containerRef.current.clientHeight || 380;

        const cameraObj = new THREE.PerspectiveCamera(
          45,
          width / height,
          0.1,
          2000
        );
        const camPos = camera?.position ?? [6, 6, 6];
        const camTarget = camera?.target ?? [0, 0, 0];
        cameraObj.position.set(camPos[0], camPos[1], camPos[2]);
        cameraObj.lookAt(camTarget[0], camTarget[1], camTarget[2]);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio ?? 1);
        renderer.setSize(width, height, false);
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(renderer.domElement);

        const OrbitControls = controlsModule.OrbitControls;
        const controls = new OrbitControls(cameraObj, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.target.set(camTarget[0], camTarget[1], camTarget[2]);

        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(5, 10, 7);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.35));

        const axesHelper = new THREE.AxesHelper(3);
        scene.add(axesHelper);
        const grid = new THREE.GridHelper(20, 20, 0x3b82f6, 0x1e293b);
        const gridMaterial = grid.material as Material;
        gridMaterial.opacity = 0.25;
        gridMaterial.transparent = true;
        scene.add(grid);

        if (
          surface &&
          surface.values.length > 0 &&
          surface.values[0].length > 0
        ) {
          const rows = surface.values.length;
          const cols = surface.values[0]!.length;
          const geometry = new THREE.PlaneGeometry(
            (cols - 1) * (surface.xStep ?? 1),
            (rows - 1) * (surface.yStep ?? 1),
            cols - 1,
            rows - 1
          );
          const positions = geometry.attributes.position as BufferAttribute;
          const { min: minZ, max: maxZ } = computeSurfaceExtent(surface.values);
          const colorAttr =
            (geometry.getAttribute("color") as BufferAttribute | null) ??
            new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
          geometry.setAttribute("color", colorAttr);
          for (let i = 0; i < positions.count; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const value = surface.values[row]?.[col] ?? 0;
            positions.setZ(i, value);
            const ratio = (value - minZ) / (maxZ - minZ);
            const [r, g, b] = sampleColorRgb(
              surface.colorScale ?? "viridis",
              ratio
            );
            colorAttr.setXYZ(i, r, g, b);
          }
          positions.needsUpdate = true;
          colorAttr.needsUpdate = true;
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            flatShading: false,
            opacity: mode === "light" ? 0.95 : 0.85,
            transparent: true,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotateX(-Math.PI / 2);
          scene.add(mesh);
        }

        if (lines && lines.length > 0) {
          for (const line of lines) {
            if (!line.points || line.points.length < 2) continue;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(line.points.length * 3);
            line.points.forEach((point, idx) => {
              positions[idx * 3 + 0] = point[0];
              positions[idx * 3 + 1] = point[1];
              positions[idx * 3 + 2] = point[2];
            });
            geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(positions, 3)
            );
            const material = new THREE.LineBasicMaterial({
              color: line.color ?? (mode === "light" ? 0x1d4ed8 : 0x38bdf8),
              linewidth: line.width ?? 2,
            });
            const lineMesh = new THREE.Line(geometry, material);
            scene.add(lineMesh);
          }
        }

        if (points && points.length > 0) {
          for (const point of points) {
            const sphere = new THREE.Mesh(
              new THREE.SphereGeometry(
                Math.max(0.12, (point.size ?? 1) * 0.1),
                24,
                24
              ),
              new THREE.MeshStandardMaterial({
                color:
                  point.color ?? (mode === "light" ? "#0f172a" : "#f8fafc"),
                metalness: 0.1,
                roughness: 0.4,
              })
            );
            sphere.position.set(
              point.position[0],
              point.position[1],
              point.position[2]
            );
        scene.add(sphere);
          }
        }

        let animationFrame = 0;
        const renderLoop = () => {
          controls.update();
          renderer.render(scene, cameraObj);
          animationFrame = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        let resizeObserver: ResizeObserver | undefined;
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth || width;
            const h = containerRef.current.clientHeight || height;
            cameraObj.aspect = w / h;
            cameraObj.updateProjectionMatrix();
            renderer.setSize(w, h, false);
          });
          resizeObserver.observe(containerRef.current);
        }

        cleanup = () => {
          cancelAnimationFrame(animationFrame);
          resizeObserver?.disconnect();
          controls.dispose();
          renderer.dispose();
          scene.traverse((obj: Object3D) => {
            if (obj instanceof THREE.Mesh) {
              obj.geometry?.dispose?.();
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose?.());
              } else {
                obj.material?.dispose?.();
              }
            }
          });
          containerRef.current?.removeChild(renderer.domElement);
        };

        if (mounted) setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Failed to initialize 3D scene"
        );
      }
    };

    mount();

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [points, lines, surface, camera, background, mode]);

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      {error ? (
        <div className="text-red-500">Failed to render 3D plot: {error}</div>
      ) : (
        <div ref={containerRef} className="relative h-[340px] w-full" />
      )}
    </div>
  );
};
