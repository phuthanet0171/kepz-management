import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "owner" | "staff";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  display_name: string | null;
};

/** ผู้ใช้ที่ล็อกอินอยู่และยังเปิดใช้งาน (คืน null ถ้าไม่มีสิทธิ์) — cache ต่อหนึ่ง request */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase
    .from("app_users")
    .select("role, display_name, is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row || !row.is_active) return null;
  return { id: data.user.id, email: data.user.email ?? "", role: row.role as Role, display_name: row.display_name };
});

export async function isOwner() {
  return (await getCurrentUser())?.role === "owner";
}

/** ใช้ในหน้าที่เปิดได้เฉพาะ Owner: คนอื่นจะเห็นหน้า "ไม่พบ" */
export async function requireOwner() {
  const user = await getCurrentUser();
  if (user?.role !== "owner") notFound();
  return user;
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", staff: "Staff" };

/** ใช้ใน Server Action ที่ทำได้เฉพาะ Owner: คืนข้อความ error ถ้าไม่ใช่ Owner */
export async function ownerOnlyError(): Promise<string | null> {
  return (await isOwner()) ? null : "ทำรายการนี้ได้เฉพาะ Owner";
}
