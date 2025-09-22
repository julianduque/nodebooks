"use client";

import NotebookView from "../../../components/NotebookView";
import { useParams } from "next/navigation";

export default function NotebookEditorPage() {
  const params = useParams<{ id: string }>();
  return <NotebookView initialNotebookId={params.id} />;
}
