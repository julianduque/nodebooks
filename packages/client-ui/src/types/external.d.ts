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

declare module "monaco-editor/esm/vs/basic-languages/sql/sql" {
  export const language: {
    keywords: string[];
    operators: string[];
    builtinFunctions: string[];
    builtinVariables: string[];
    tokenizer: unknown;
  };
  export const conf: {
    comments: unknown;
    brackets: unknown;
    autoClosingPairs: unknown;
    surroundingPairs: unknown;
  };
}
