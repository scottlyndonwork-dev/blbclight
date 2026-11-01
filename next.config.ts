import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // The certificate PDF falls back to the bundled logo read from disk.
  outputFileTracingIncludes: {
    "/api/certificates/*/pdf": ["./public/brand/logo-512.png"],
  },
  experimental: {
    serverActions: {
      // Member photos (2 MB) and finance attachments (10 MB) are uploaded through actions.
      bodySizeLimit: "12mb",
    },
  },
  // Private member photos and logos are served via short-lived signed URLs and
  // deliberately NOT through next/image, whose optimizer cache is shared.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
