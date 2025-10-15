declare module "plotly.js-dist-min" {
  export interface PlotlyModule {
    react(
      element: HTMLElement,
      data: unknown,
      layout?: unknown,
      config?: unknown
    ): Promise<unknown> | unknown;
    purge(element: HTMLElement): void;
  }
  const Plotly: PlotlyModule;
  export default Plotly;
}

declare module "three/examples/jsm/controls/OrbitControls" {
  export * from "three/examples/jsm/controls/OrbitControls.js";
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  import type { Camera, EventDispatcher, Vector3 } from "three";

  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    enableDamping: boolean;
    dampingFactor: number;
    target: Vector3;
    update(): void;
    dispose(): void;
  }
}
