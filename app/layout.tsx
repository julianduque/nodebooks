import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fallbackSiteUrl = "https://julianduque.github.io/nodebooks";
const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.length > 0
    ? process.env.NEXT_PUBLIC_SITE_URL
    : fallbackSiteUrl;
const siteUrl = configuredSiteUrl.endsWith("/") ? configuredSiteUrl : `${configuredSiteUrl}/`;
const ogImage = new URL("assets/opengraph-image.png", siteUrl).toString();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "NodeBooks – Interactive Node.js Notebooks",
  description:
    "NodeBooks is a JavaScript and TypeScript notebook environment with live outputs, collaborative terminals, and notebook-scoped dependencies.",
  openGraph: {
    url: siteUrl,
    title: "NodeBooks – Interactive Node.js Notebooks",
    description:
      "Prototype with Markdown, execute TypeScript, and stream results live using NodeBooks.",
    siteName: "NodeBooks",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "NodeBooks hero preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeBooks – Interactive Node.js Notebooks",
    description:
      "Notebook workflows for JavaScript teams with real-time streaming and rich UI components.",
    images: [ogImage],
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
