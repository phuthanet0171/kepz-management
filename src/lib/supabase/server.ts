import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseKey, supabaseUrl } from "./env";

export async function createClient() {
  // ข้อมูลผู้ใช้ต้องอ่านตอนมีคำขอจริงเท่านั้น (Supabase ใช้เวลาปัจจุบันตรวจ token) กัน error
  // "Date.now() while prerendering" ของ Next 16 ตอน prefetch
  await connection();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // เรียกจาก Server Component ซึ่งตั้ง cookie ไม่ได้ — proxy จะต่ออายุ session ให้แทน
        }
      },
    },
  });
}
