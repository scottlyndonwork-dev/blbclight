import type { MetadataRoute } from "next";

/** Lets members of staff install LIGHT to their phone or tablet home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIGHT — Church Management",
    short_name: "LIGHT",
    description: "Leadership Information, Governance, and Holistic Tracking. Church Management Information System.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#16273d",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
