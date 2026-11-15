"use server";

import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };

  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: thaiError(error, "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่") };

  // Owner มองเห็นบัญชีทุกคน จึงต้องระบุ user_id ของตัวเอง
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("is_active")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (userError) {
    await supabase.auth.signOut();
    return { error: "ฐานข้อมูลยังไม่ได้อัปเดตเป็นเวอร์ชันล่าสุด กรุณารันไฟล์ SQL ล่าสุดใน Supabase (0003_users_roles.sql)" };
  }
  if (!user || !user.is_active) {
    await supabase.auth.signOut();
    return { error: user ? "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อเจ้าของกิจการ" : "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ Kepz" };
  }

  // อนุญาตให้กลับไปเฉพาะหน้าภายในระบบ
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
