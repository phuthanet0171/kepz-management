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
  // getClaims ตรวจ token ในเครื่องได้ ไม่ต้องเรียกเซิร์ฟเวอร์ Auth ทุกครั้งเหมือน getUser
  // จึงไม่ล้มเหลวเมื่อสัญญาณมือถือสะดุดชั่วขณะ
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  // ลองซ้ำ 1 ครั้งถ้าเครือข่ายสะดุด เพื่อไม่ให้เมนูของ Owner หายไปชั่วคราว
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error } = await supabase
      .from("app_users")
      .select("role, display_name, is_active")
      .eq("user_id", claims.sub)
      .maybeSingle();
    if (error) continue;
    if (!row || !row.is_active) return null;
    return { id: claims.sub, email: claims.email ?? "", role: row.role as Role, display_name: row.display_name };
  }
  throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ กรุณาลองใหม่");
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
