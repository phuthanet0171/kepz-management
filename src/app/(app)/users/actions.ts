"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { thaiError } from "@/lib/errors";
import { bool, reqStr } from "@/lib/form";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/types";

const BANNED = "876000h"; // ปิดการใช้งาน ~100 ปี

async function ownerGuard(): Promise<{ error: string } | { ownerId: string }> {
  const me = await getCurrentUser();
  if (me?.role !== "owner") return { error: "จัดการผู้ใช้ได้เฉพาะ Owner" };
  if (!isAdminConfigured) return { error: "ระบบยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY (ดูวิธีตั้งค่าที่หน้านี้)" };
  return { ownerId: me.id };
}

function authError(msg: string, fallback: string) {
  if (/already been registered|already registered|email_exists/i.test(msg)) return "อีเมลนี้มีบัญชีอยู่แล้ว";
  if (/password/i.test(msg) && /(weak|short|least)/i.test(msg)) return "รหัสผ่านไม่ปลอดภัยพอ กรุณาตั้งให้ยาวขึ้น";
  if (/invalid.*email|email.*invalid/i.test(msg)) return "รูปแบบอีเมลไม่ถูกต้อง";
  return fallback;
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const guard = await ownerGuard();
  if ("error" in guard) return guard;

  const email = reqStr(fd, "email").toLowerCase();
  const name = reqStr(fd, "display_name");
  const password = String(fd.get("password") ?? "");
  const role = reqStr(fd, "role");

  if (!name) return { error: "กรุณากรอกชื่อ" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (password.length < 8) return { error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" };
  if (!["owner", "staff"].includes(role)) return { error: "กรุณาเลือกสิทธิ์" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error || !data.user) return { error: authError(error?.message ?? "", "สร้างบัญชีไม่สำเร็จ") };

  const { error: rowError } = await admin
    .from("app_users")
    .upsert({ user_id: data.user.id, role, display_name: name, email, is_active: true });
  if (rowError) {
    // ย้อนกลับ ไม่ให้เหลือบัญชีที่ไม่มีสิทธิ์ค้างอยู่
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: thaiError(rowError, "สร้างบัญชีไม่สำเร็จ") };
  }

  revalidatePath("/users");
  return { ok: true, message: `สร้างบัญชี ${email} แล้ว แจ้งอีเมลและรหัสผ่านให้ผู้ใช้เพื่อเข้าสู่ระบบ` };
}

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const guard = await ownerGuard();
  if ("error" in guard) return guard;

  const userId = reqStr(fd, "user_id");
  const name = reqStr(fd, "display_name");
  const role = reqStr(fd, "role");
  const active = bool(fd, "is_active");
  const newPassword = String(fd.get("new_password") ?? "");

  if (!name) return { error: "กรุณากรอกชื่อ" };
  if (!["owner", "staff"].includes(role)) return { error: "กรุณาเลือกสิทธิ์" };
  if (newPassword && newPassword.length < 8) return { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" };
  if (userId === guard.ownerId && (role !== "owner" || !active)) {
    return { error: "ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้ ให้ Owner คนอื่นเป็นผู้ทำ" };
  }

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (!authUser.user) return { error: "ไม่พบบัญชีนี้" };
  // upsert: รองรับบัญชีที่ถูกสร้างตรงใน Supabase และยังไม่เคยได้รับสิทธิ์
  const { error } = await admin
    .from("app_users")
    .upsert({ user_id: userId, display_name: name, role, is_active: active, email: authUser.user.email ?? null });
  if (error) return { error: thaiError(error, "บันทึกไม่สำเร็จ") };

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : BANNED,
    ...(newPassword ? { password: newPassword } : {}),
  });
  if (authErr) return { error: authError(authErr.message, "บันทึกสิทธิ์แล้ว แต่ปรับสถานะการเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง") };

  revalidatePath("/users");
  return { ok: true };
}

export async function deleteUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const guard = await ownerGuard();
  if ("error" in guard) return guard;

  const userId = reqStr(fd, "user_id");
  const confirm = reqStr(fd, "confirm_email").toLowerCase();
  if (userId === guard.ownerId) return { error: "ไม่สามารถลบบัญชีของตัวเองได้ ให้ Owner คนอื่นเป็นผู้ลบ" };

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (!authUser.user) return { error: "ไม่พบบัญชีนี้" };
  if (confirm !== (authUser.user.email ?? "").toLowerCase()) return { error: "อีเมลที่พิมพ์ยืนยันไม่ตรงกัน" };

  // ต้องเหลือ Owner ที่ใช้งานได้อย่างน้อย 1 คน (ฐานข้อมูลก็กันไว้อีกชั้น)
  const { data: owners } = await admin.from("app_users").select("user_id").eq("role", "owner").eq("is_active", true);
  if ((owners ?? []).every((o) => o.user_id === userId)) {
    return { error: "ลบไม่ได้ ต้องมี Owner ที่ใช้งานได้อย่างน้อย 1 คน" };
  }

  // ลบบัญชีใน Supabase Auth แล้วสิทธิ์ใน app_users จะถูกลบตาม (cascade)
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: authError(error.message, "ลบบัญชีไม่สำเร็จ กรุณาลองใหม่") };

  revalidatePath("/users");
  return { ok: true };
}
