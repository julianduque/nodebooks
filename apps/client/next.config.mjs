/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  eslint: {
    dirs: ["app", "components"],
  },
  transpilePackages: ["@nodebooks/notebook-ui", "@nodebooks/notebook-schema"],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
