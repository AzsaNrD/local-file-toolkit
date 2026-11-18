import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the desktop build needs the self-contained server folder; the web build stays as is.
  ...(process.env.ELECTRON_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
