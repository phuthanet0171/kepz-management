import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // อัปโหลดรูปลายน้ำเอกสาร (ย่อแล้วไม่เกิน ~1.5 MB) ผ่าน Server Action
    serverActions: { bodySizeLimit: "3mb" },
  },
  partialPrefetching: true,
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
