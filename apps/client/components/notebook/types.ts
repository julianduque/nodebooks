import type { NotebookTemplateId as SchemaNotebookTemplateId } from "@nodebooks/notebook-schema";

export interface NotebookSessionSummary {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

export type NotebookTemplateId = SchemaNotebookTemplateId;

export interface OutlineItem {
  id: string;
  cellId: string;
  title: string;
  level: number;
}

export interface NotebookViewProps {
  initialNotebookId?: string;
}
