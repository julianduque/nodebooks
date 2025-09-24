/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  eslint: {
    dirs: ["app", "components"],
  },
  transpilePackages: ["@nodebooks/notebook-ui", "@nodebooks/notebook-schema"],
};

export default nextConfig;
