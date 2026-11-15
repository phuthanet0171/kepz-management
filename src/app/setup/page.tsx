import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "ตั้งค่าการเชื่อมต่อ" };

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-12">
      <Logo className="text-4xl" />
      <h1 className="mt-6 text-2xl font-bold">ยังไม่ได้เชื่อมต่อฐานข้อมูล</h1>
      <p className="mt-2 text-muted">
        ระบบต้องการค่าการเชื่อมต่อ Supabase ก่อนใช้งาน กรุณาสร้างไฟล์ <code className="rounded bg-line px-1">.env.local</code>{" "}
        ในโฟลเดอร์โปรเจกต์ แล้วใส่ค่าต่อไปนี้ จากนั้นเริ่มเซิร์ฟเวอร์ใหม่
      </p>
      <pre className="card mt-4 overflow-x-auto p-4 text-sm">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
      </pre>
      <p className="mt-4 text-sm text-muted">ดูค่าได้ที่ Supabase → Project Settings → API Keys</p>
    </div>
  );
}
