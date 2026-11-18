"use server";

import { ownerOnlyError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readContractTerms } from "@/lib/contract-terms-form";
import { thaiError } from "@/lib/errors";
import { num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function createBranch(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const name = reqStr(fd, "name");
  if (!name) return { error: "กรุณากรอกชื่อสาขา" };

  const supabase = await createClient();
  const { data: types } = await supabase.from("unit_types").select("code, name");

  const counts: Record<string, number> = {};
  let total = 0;
  for (const t of types ?? []) {
    const n = num(fd, `count_${t.code}`) ?? 0;
    if (!Number.isInteger(n) || n < 0 || n > 500) {
      return { error: `จำนวน${t.name}ต้องเป็นจำนวนเต็ม 0–500` };
    }
    counts[t.code] = n;
    total += n;
  }
  if (total === 0) return { error: "กรุณาระบุจำนวนห้องหรือที่จอดอย่างน้อย 1 รายการ" };

  const { data: id, error } = await supabase.rpc("create_branch", {
    p_name: name,
    p_address: str(fd, "address"),
    p_phone: str(fd, "phone"),
    p_note: str(fd, "note"),
    p_counts: counts,
  });
  if (error) return { error: thaiError(error, "สร้างสาขาไม่สำเร็จ") };

  revalidatePath("/", "layout");
  redirect(`/branches/${id}`);
}

export async function updateBranch(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const id = reqStr(fd, "id");
  const name = reqStr(fd, "name");
  if (!name) return { error: "กรุณากรอกชื่อสาขา" };

  const terms = readContractTerms(fd, true);
  if ("error" in terms) return { error: terms.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({
      name,
      address: str(fd, "address"),
      phone: str(fd, "phone"),
      note: str(fd, "note"),
      is_active: fd.get("is_active") === "on",
      ...terms.patch,
    })
    .eq("id", id);
  if (error) return { error: thaiError(error, "บันทึกข้อมูลสาขาไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addUnits(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const branchId = reqStr(fd, "branch_id");
  const typeCode = reqStr(fd, "unit_type_code");
  const count = num(fd, "count");
  if (!typeCode) return { error: "กรุณาเลือกประเภท" };
  if (count === null || !Number.isInteger(count) || count < 1 || count > 500) {
    return { error: "จำนวนต้องเป็นจำนวนเต็ม 1–500" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_units", {
    p_branch_id: branchId,
    p_unit_type_code: typeCode,
    p_count: count,
  });
  if (error) return { error: thaiError(error, "เพิ่มห้องไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}
