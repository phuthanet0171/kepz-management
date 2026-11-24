import type { NextConfig } from "next";

// ป้องกันพื้นฐานทุกหน้า: ห้ามเว็บอื่นเอาหน้าเราไปฝัง (clickjacking), ห้ามเดาชนิดไฟล์,
// ไม่ส่ง URL เต็มไปเว็บอื่น, ปิดสิทธิ์อุปกรณ์ที่ไม่ได้ใช้ และบังคับ HTTPS
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
