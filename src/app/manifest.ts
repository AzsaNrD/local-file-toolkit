import type { MetadataRoute } from "next";

// Lets the app be installed from the browser as its own window. Colours are the dark theme's
// background and accent, since the app opens dark unless the person chose light.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Local File Toolkit",
    short_name: "File Toolkit",
    description: "PDF and image tools that run on your own machine.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07090d",
    theme_color: "#07090d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
