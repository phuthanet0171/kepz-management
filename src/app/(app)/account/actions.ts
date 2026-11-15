"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { thaiError } from "@/lib/errors";
import { str } from "@/lib/form";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function updateDisplayName(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };
  const name = str(fd, "display_name");
  if (!name) return { error: "กรุณากรอกชื่อที่แสดง" };
  if (name.length > 60) return { error: "ชื่อยาวได้ไม่เกิน 60 ตัวอักษร" };
  if (!isAdminConfigured) return { error: "ระบบยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY" };

  // แก้ได้เฉพาะแถวของตัวเอง
  const { error } = await createAdminClient().from("app_users").update({ display_name: name }).eq("user_id", user.id);
  if (error) return { error: thaiError(error, "บันทึกชื่อไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (pw.length < 8) return { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" };
  if (pw !== confirm) return { error: "ยืนยันรหัสผ่านไม่ตรงกัน" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) {
    if (error.message.includes("different from the old")) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" };
    return { error: thaiError(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ") };
  }
  return { ok: true, message: "เปลี่ยนรหัสผ่านแล้ว" };
}
