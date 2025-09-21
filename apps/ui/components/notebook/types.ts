export interface NotebookSessionSummary {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

export type NotebookTemplateId = "starter" | "typescript" | "blank";

export interface OutlineItem {
  id: string;
  cellId: string;
  title: string;
  level: number;
}

export interface NotebookViewProps {
  initialNotebookId?: string;
}
