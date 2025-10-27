import type { FeatureItem } from "@/lib/content";
import { features } from "@/lib/content";

function selectFeatures(titles: string[]): FeatureItem[] {
  return features.filter(({ title }) => titles.includes(title));
}

export const notebookAuthoringFeatures = selectFeatures([
  "Markdown & Code Cells",
  "AI-Powered Generation",
  "Rich Display Components",
  "LaTeX & Mermaid",
]);

export const runtimeAndDependencyFeatures = selectFeatures([
  "Sandboxed Runtime",
  "Notebook-Level Dependencies",
  "Project Workspaces",
  "SQLite & Postgres Persistence",
]);

export const collaborationFeatures = selectFeatures([
  "Real-Time Collaboration",
  "Live Streaming Outputs",
]);

export const publishingFeatures = selectFeatures(["Publish Notebook Sites"]);
