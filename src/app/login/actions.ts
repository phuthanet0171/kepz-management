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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: thaiError(error, "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่") };

  const { data: owner } = await supabase.from("app_users").select("role").maybeSingle();
  if (!owner) {
    await supabase.auth.signOut();
    return { error: "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ Kepz" };
  }

  // อนุญาตให้กลับไปเฉพาะหน้าภายในระบบ
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
