export interface DocsPage {
  slug: string;
  href: string;
  title: string;
  description: string;
}

export const docsPages: DocsPage[] = [
  {
    slug: "overview",
    href: "/docs",
    title: "Overview",
    description: "What NodeBooks is and how documentation is organized.",
  },
  {
    slug: "getting-started",
    href: "/docs/getting-started",
    title: "Getting Started",
    description: "Install the CLI and spin up your first workspace.",
  },
  {
    slug: "notebook-authoring",
    href: "/docs/notebook-authoring",
    title: "Notebook Authoring",
    description: "Compose notebooks with Markdown, code cells, and rich visual outputs.",
  },
  {
    slug: "runtime-and-dependencies",
    href: "/docs/runtime-and-dependencies",
    title: "Runtime & Dependencies",
    description: "Manage the sandboxed runtime, environment variables, and package installs.",
  },
  {
    slug: "collaboration",
    href: "/docs/collaboration",
    title: "Collaboration",
    description: "Work with teammates in real time and keep everyone in sync.",
  },
  {
    slug: "publishing",
    href: "/docs/publishing",
    title: "Publishing & Sharing",
    description: "Ship notebooks to the web and share results securely.",
  },
];

export type DocsPageSlug = (typeof docsPages)[number]["slug"];

export function getAdjacentDocs(slug: DocsPageSlug) {
  const index = docsPages.findIndex((page) => page.slug === slug);

  if (index === -1) {
    throw new Error(`Unknown docs page slug: ${slug}`);
  }

  const previous = index > 0 ? docsPages[index - 1] : null;
  const next = index < docsPages.length - 1 ? docsPages[index + 1] : null;

  return {
    previous,
    next,
  };
}
