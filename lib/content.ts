import {
  Boxes,
  Database,
  FunctionSquare,
  Globe,
  Package,
  Radio,
  Share2,
  Sparkles,
  TerminalSquare,
  Type,
  Users,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

export interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const features: FeatureItem[] = [
  {
    title: "Markdown & Code Cells",
    description: "Draft notebooks with rich Markdown and runnable JavaScript or TypeScript blocks.",
    icon: Type,
  },
  {
    title: "AI-Powered Generation",
    description:
      "Let NodeBooks suggest code and Markdown directly inside cells to accelerate iteration.",
    icon: Sparkles,
  },
  {
    title: "Sandboxed Runtime",
    description:
      "Execute TypeScript/JavaScript safely in an isolated Node.js runtime tuned for notebooks.",
    icon: TerminalSquare,
  },
  {
    title: "Real-Time Collaboration",
    description: "Edit notebooks together, watch changes appear instantly, and keep teams in sync.",
    icon: Users,
  },
  {
    title: "Live Streaming Outputs",
    description:
      "See notebook results stream to every viewer in real time for a pair-friendly workflow.",
    icon: Radio,
  },
  {
    title: "Notebook-Level Dependencies",
    description:
      "Install npm packages per notebook and keep experiments isolated from global installs.",
    icon: Package,
  },
  {
    title: "Project Workspaces",
    description:
      "Organize notebooks by project with shared configs, secrets, and connected data sources.",
    icon: Share2,
  },
  {
    title: "Rich Display Components",
    description:
      "Render tables, charts, maps, alerts, and custom visuals with the built-in UI toolkit.",
    icon: Boxes,
  },
  {
    title: "LaTeX & Mermaid",
    description:
      "Typeset math with LaTeX and embed Mermaid diagrams to visualize data pipelines and flows.",
    icon: FunctionSquare,
  },
  {
    title: "SQLite & Postgres Persistence",
    description:
      "Bundle the SQLite database or scale notebooks with PostgreSQL—choose what fits your team.",
    icon: Database,
  },
  {
    title: "Publish Notebook Sites",
    description:
      "Turn notebooks into shareable sites and ship insights to customers or communities in minutes.",
    icon: Globe,
  },
];

export interface ScreenshotItem {
  title: string;
  description: string;
  fileUrl: string;
}

export const screenshots: ScreenshotItem[] = [
  {
    title: "Home",
    description: "Home page with no notebooks created yet",
    fileUrl: "/assets/screenshots/home.png",
  },
  {
    title: "Markdown with Mermaid support",
    description: "Markdown with Mermaid support for diagrams and charts.",
    fileUrl: "/assets/screenshots/markdown.png",
  },
  {
    title: "Dependencies and Environment Variables",
    description: "Install npm dependencies scoped to a notebook and manage environment variables.",
    fileUrl: "/assets/screenshots/settings.png",
  },
  {
    title: "UI Components",
    description: "Custom UI components for charts, maps, tables, alerts, and more rendered inline.",
    fileUrl: "/assets/screenshots/ui-components.png",
  },
];

export interface WorkflowStep {
  title: string;
  description: string;
  icon: LucideIcon;
  code?: string;
}

export const workflow: WorkflowStep[] = [
  {
    title: "Install the CLI",
    description: "Grab the NodeBooks CLI globally so it’s ready from any terminal session.",
    icon: Package,
    code: "npm install -g @nodebooks/cli",
  },
  {
    title: "Configure Your Space",
    description: "Initialize settings, connect persistence, and invite collaborators.",
    icon: Share2,
    code: "nbks config",
  },
  {
    title: "Run & Share",
    description: "Start the environment, collaborate in real time, and publish notebooks as sites.",
    icon: Radio,
    code: "nbks start",
  },
];
