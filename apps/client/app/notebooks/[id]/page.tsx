import type { Metadata } from "next";
import NotebookView from "../../../components/NotebookView";

interface NotebookPageProps {
  params: Promise<{ id: string }>;
}

const buildNotebookApiUrl = (id: string): string => {
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (rawBase && /^https?:\/\//.test(rawBase)) {
    const normalized = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
    return `${normalized}/notebooks/${id}`;
  }

  const fallback = rawBase ?? "/api";
  const trimmed = fallback.endsWith("/") ? fallback.slice(0, -1) : fallback;
  if (!trimmed || trimmed === "/") {
    return `/notebooks/${id}`;
  }
  if (trimmed.startsWith("/")) {
    return `${trimmed}/notebooks/${id}`;
  }
  return `/${trimmed}/notebooks/${id}`;
};

export const generateMetadata = async ({
  params,
}: NotebookPageProps): Promise<Metadata> => {
  const fallbackTitle = "Notebook";
  let notebookTitle: string | null = null;
  const { id } = await params;

  try {
    const response = await fetch(buildNotebookApiUrl(id), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const payload = await response.json();
      const name = payload?.data?.name;
      if (typeof name === "string" && name.trim().length > 0) {
        notebookTitle = name.trim();
      }
    }
  } catch {
    // Metadata should never block rendering; fall back to defaults when the API is unavailable.
  }

  const title = notebookTitle ?? fallbackTitle;
  const fullTitle = notebookTitle
    ? `${notebookTitle} · NodeBooks`
    : "NodeBooks";
  const description = notebookTitle
    ? `Notebook ${notebookTitle} in NodeBooks.`
    : "Interactive Node.js Notebooks.";

  return {
    title,
    openGraph: {
      title: fullTitle,
      description,
    },
    twitter: {
      title: fullTitle,
      description,
    },
  };
};

const NotebookEditorPage = async ({ params }: NotebookPageProps) => {
  const { id } = await params;
  return <NotebookView initialNotebookId={id} />;
};

export default NotebookEditorPage;
