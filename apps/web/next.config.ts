import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tacl/core", "@tacl/scenarios"],
};

export default nextConfig;
