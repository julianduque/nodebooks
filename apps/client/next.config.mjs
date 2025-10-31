/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.gravatar.com",
      },
    ],
  },
  transpilePackages: [
    "@nodebooks/ui",
    "@nodebooks/client-ui",
    "@nodebooks/notebook-schema",
    "@nodebooks/plugin-engine",
    "@nodebooks/cell-plugin-api",
    "@nodebooks/terminal-cells",
    "@nodebooks/sql-cell",
    "@nodebooks/http-cell",
    "@nodebooks/plot-cell",
    "@nodebooks/ai-cell",
  ],
  // Empty turbopack config to acknowledge we have webpack config
  turbopack: {},
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
