import "./globals.css";
import "@nodebooks/notebook-ui/styles.css";
import "@xterm/xterm/css/xterm.css";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { clientConfig } from "@nodebooks/config/client";
import { loadServerConfig } from "@nodebooks/config";

import { ThemeProvider, type ThemeMode } from "@/components/theme-context";

const inter = Inter({ subsets: ["latin"] });

const BASE_DESCRIPTION = "Interactive Node.js Notebooks";

const resolveOrigin = async (): Promise<string | undefined> => {
  const siteUrl = clientConfig().siteUrl;
  if (siteUrl) return siteUrl;
  try {
    const h = await headers();
    const protocol = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${protocol}://${host}`;
  } catch {
    // headers() not available during static build; fall back to undefined
  }
  return undefined;
};

export async function generateMetadata(): Promise<Metadata> {
  const origin = await resolveOrigin();
  return {
    metadataBase: new URL(origin ?? "http://localhost:3000"),
    title: {
      default: "NodeBooks",
      template: "%s · NodeBooks",
    },
    description: BASE_DESCRIPTION,
    openGraph: {
      // Intentionally omit title so it mirrors page <title>
      description: BASE_DESCRIPTION,
      siteName: "NodeBooks",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      // Omit title/description to inherit from page <title>/description
      images: ["/opengraph-image"],
    },
    icons: {
      icon: "/icon.svg",
      shortcut: "/icon.svg",
      apple: "/icon.svg",
    },
  };
}

interface RootLayoutProps {
  children: React.ReactNode;
}

const resolveInitialTheme = (): ThemeMode => {
  return loadServerConfig().theme;
};

const RootLayout = ({ children }: RootLayoutProps) => {
  const initialTheme = resolveInitialTheme();
  return (
    <html
      lang="en"
      className={initialTheme === "dark" ? "dark" : undefined}
      data-theme={initialTheme}
      suppressHydrationWarning
    >
      <body className={inter.className}>
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
