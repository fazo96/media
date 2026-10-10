import type { MetadataRoute } from "next";

// Installable. The service worker (public/sw.js) keeps the pages and the app's
// own files; videos and the API always come from the server.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "media",
    short_name: "media",
    description: "The videos you watch again, kept here.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#121110",
    theme_color: "#121110",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
