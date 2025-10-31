import type { Metadata } from "next";
import type { Notebook } from "@/types/notebook";
import type { Project } from "@nodebooks/notebook-schema";
import NotebookPublicView from "@/components/notebook/notebook-public-view";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { clientConfig } from "@nodebooks/config/client";

export const dynamic = "force-dynamic";

interface PublicProjectPayload {
  project: Project;
  notebooks: Notebook[];
}

interface PublicNotebookPayload {
  notebook: Notebook;
  project: PublicProjectPayload | null;
}

const buildApiUrl = async (path: string) => {
  const apiConfig = clientConfig();
  const apiBase = apiConfig.apiBaseUrl ?? "/api";

  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    const baseUrl = apiBase.endsWith("/") ? apiBase : `${apiBase}/`;
    return `${baseUrl}${normalizedPath}`;
  }

  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  if (!host) {
    throw new Error("Unable to resolve host for publish request");
  }
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const base = apiBase.startsWith("/") ? apiBase : `/${apiBase}`;
  const trimmedBase = base.endsWith("/") ? base : `${base}/`;
  return `${protocol}://${host}${trimmedBase}${normalizedPath}`;
};

const fetchPublicPayload = async (segments: string[]) => {
  if (segments.length === 1) {
    const identifier = encodeURIComponent(segments[0] ?? "");
    const url = await buildApiUrl(`public/notebooks/${identifier}`);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json().catch(() => null)) as {
      data?: PublicNotebookPayload;
    } | null;
    return payload?.data ?? null;
  }
  if (segments.length === 2) {
    const projectSlug = encodeURIComponent(segments[0] ?? "");
    const notebookSlug = encodeURIComponent(segments[1] ?? "");
    const url = await buildApiUrl(
      `public/projects/${projectSlug}/notebooks/${notebookSlug}`
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json().catch(() => null)) as {
      data?: PublicNotebookPayload;
    } | null;
    return payload?.data ?? null;
  }
  return null;
};

const buildNotebookHref = (
  notebook: Notebook,
  project: PublicProjectPayload | null
) => {
  if (
    project &&
    notebook.projectId === project.project.id &&
    project.project.slug
  ) {
    const slugPart = notebook.publicSlug ?? notebook.id;
    return `/v/${encodeURIComponent(project.project.slug)}/${encodeURIComponent(
      slugPart
    )}`;
  }
  const identifier = notebook.publicSlug ?? notebook.id;
  return `/v/${encodeURIComponent(identifier)}`;
};

type PublicPageProps = Readonly<{
  params: Promise<{ slug?: string[] }>;
}>;

export const generateMetadata = async ({
  params,
}: PublicPageProps): Promise<Metadata> => {
  const fallbackTitle = "Notebook";
  const resolvedParams = await params;
  const segments = Array.isArray(resolvedParams?.slug)
    ? resolvedParams.slug
    : [];

  let notebookTitle: string | null = null;
  try {
    const payload = await fetchPublicPayload(segments);
    const candidate = payload?.notebook?.name;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      notebookTitle = candidate.trim();
    }
  } catch {
    // Metadata fetch failure should not block rendering; fall back to defaults.
  }

  const title = notebookTitle ?? fallbackTitle;
  const description = notebookTitle
    ? `Explore "${notebookTitle}" on NodeBooks.`
    : "Explore public notebooks built with NodeBooks.";
  const ogImage = "/opengraph-image";

  return {
    title,
    openGraph: {
      description,
      images: [ogImage],
    },
    twitter: {
      images: [ogImage],
    },
  };
};

const PublicPage = async ({ params }: PublicPageProps) => {
  const resolvedParams = await params;
  const segments = Array.isArray(resolvedParams?.slug)
    ? resolvedParams.slug
    : [];
  const payload = await fetchPublicPayload(segments);
  if (!payload || !payload.notebook || !payload.notebook.published) {
    notFound();
  }

  const projectPayload = payload.project;
  const notebookMap = new Map<string, Notebook>();
  notebookMap.set(payload.notebook.id, payload.notebook);
  if (projectPayload) {
    for (const entry of projectPayload.notebooks) {
      notebookMap.set(entry.id, entry);
    }
  }

  const notebookHrefById = Object.fromEntries(
    Array.from(notebookMap.entries()).map(([id, entry]) => [
      id,
      buildNotebookHref(entry, projectPayload),
    ])
  );

  const projectForView = projectPayload
    ? {
        id: projectPayload.project.id,
        name: projectPayload.project.name,
        notebooks: projectPayload.notebooks,
      }
    : null;

  return (
    <NotebookPublicView
      notebook={payload.notebook}
      project={projectForView}
      notebookHrefById={notebookHrefById}
    />
  );
};

export default PublicPage;
