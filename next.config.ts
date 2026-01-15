import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", "10.1.1.104"],
  experimental: {
    webpackBuildWorker: false,
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
