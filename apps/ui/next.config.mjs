/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  eslint: {
    dirs: ["app", "components"],
  },
};

export default nextConfig;
