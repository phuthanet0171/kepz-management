"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { bool, isMoney, num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function updateUnit(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const code = reqStr(fd, "code").toUpperCase();
  const unitTypeCode = reqStr(fd, "unit_type_code");
  const price = num(fd, "monthly_price");

  if (!code) return { error: "กรุณากรอกรหัสห้อง" };
  if (code.length > 20) return { error: "รหัสห้องยาวได้ไม่เกิน 20 ตัวอักษร" };
  if (price !== null && !isMoney(price)) return { error: "ราคาไม่ถูกต้อง" };

  const supabase = await createClient();
  const isMaintenance = bool(fd, "is_maintenance");
  const isActive = bool(fd, "is_active");

  if (!isActive || isMaintenance) {
    const { count } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", id)
      .eq("status", "active");
    if (count) return { error: "ห้องนี้มีผู้เช่าอยู่ ต้องสิ้นสุดสัญญาก่อนจึงจะปิดปรับปรุงหรือปิดใช้งานได้" };
  }

  const { error } = await supabase
    .from("units")
    .update({
      code,
      unit_type_code: unitTypeCode,
      monthly_price: price,
      is_maintenance: isMaintenance,
      is_active: isActive,
      note: str(fd, "note"),
    })
    .eq("id", id);
  if (error) return { error: thaiError(error, "บันทึกข้อมูลห้องไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteUnit(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const supabase = await createClient();

  const { data: unit } = await supabase.from("units").select("branch_id").eq("id", id).single();
  if (!unit) return { error: "ไม่พบห้อง" };

  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "ลบไม่ได้ เพราะห้องนี้มีประวัติสัญญาเช่า ให้ปิดใช้งานแทน" };
    return { error: thaiError(error, "ลบห้องไม่สำเร็จ") };
  }

  revalidatePath("/", "layout");
  redirect(`/branches/${unit.branch_id}`);
}
