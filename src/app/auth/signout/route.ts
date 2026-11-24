import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** ออกจากระบบแล้วพากลับหน้าเข้าสู่ระบบ — ใช้เมื่อบัญชีถูกปิดการใช้งานหรือไม่มีสิทธิ์แล้ว */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?inactive=1", request.url));
}
