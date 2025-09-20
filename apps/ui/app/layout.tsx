import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NodeBooks",
  description: "Interactive Node.js notebooks",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" className="bg-slate-50">
      <body className={inter.className}>{children}</body>
    </html>
  );
};

export default RootLayout;
