import "./globals.css";
import "@nodebooks/notebook-ui/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

const BASE_DESCRIPTION = "Interactive Node.js Notebooks";

export const metadata: Metadata = {
  title: {
    default: "NodeBooks",
    template: "%s · NodeBooks",
  },
  description: BASE_DESCRIPTION,
  openGraph: {
    title: "NodeBooks",
    description: BASE_DESCRIPTION,
    siteName: "NodeBooks",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeBooks",
    description: BASE_DESCRIPTION,
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

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
