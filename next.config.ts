import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";

const repositoryBasePath = "";
const isProduction = process.env.NODE_ENV === "production";

const basePathInput = process.env.NEXT_PUBLIC_BASE_PATH
  ? ensureLeadingSlash(process.env.NEXT_PUBLIC_BASE_PATH)
  : isProduction
    ? repositoryBasePath
    : "";

const assetPrefixInput = process.env.NEXT_PUBLIC_ASSET_PREFIX
  ? ensureLeadingSlash(process.env.NEXT_PUBLIC_ASSET_PREFIX)
  : isProduction
    ? repositoryBasePath
    : "";

function ensureLeadingSlash(value: string) {
  if (!value) {
    return value;
  }
  return value.startsWith("/") ? value.replace(/\/+$/, "") : `/${value.replace(/\/+$/, "")}`;
}

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkGfm],
  },
});

const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  basePath: basePathInput || undefined,
  assetPrefix: assetPrefixInput || undefined,
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.herokucdn.com",
      },
      {
        protocol: "https",
        hostname: "herokucdn.com",
      },
    ],
  },
  typedRoutes: true,
};

export default withMDX(config);
