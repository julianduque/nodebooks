import "./globals.css";
import "@nodebooks/notebook-ui/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";

const inter = Inter({ subsets: ["latin"] });

const BASE_DESCRIPTION = "Interactive Node.js Notebooks";

const resolveOrigin = async (): Promise<string | undefined> => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
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
    metadataBase: origin ? new URL(origin) : undefined,
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

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
};

export default RootLayout;
