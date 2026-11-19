"use server";

import { ownerOnlyError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readContractTerms } from "@/lib/contract-terms-form";
import { thaiError } from "@/lib/errors";
import { isMoney, num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

type PriceRow = { unit_type_code: string; monthly_price: number; size_label: string | null };

/** อ่านราคาและขนาดของแต่ละประเภทจากฟอร์มสาขา */
function readBranchPrices(fd: FormData, types: { code: string; name: string }[]): PriceRow[] | { error: string } {
  const rows: PriceRow[] = [];
  for (const t of types) {
    if (!fd.has(`price_${t.code}`)) continue;
    const price = num(fd, `price_${t.code}`);
    if (!isMoney(price)) return { error: `ราคา${t.name}ไม่ถูกต้อง` };
    const size = str(fd, `size_${t.code}`);
    if (size && size.length > 60) return { error: `ขนาด${t.name}ยาวเกิน 60 ตัวอักษร` };
    rows.push({ unit_type_code: t.code, monthly_price: price!, size_label: size });
  }
  return rows;
}

async function saveBranchPrices(supabase: Awaited<ReturnType<typeof createClient>>, branchId: string, rows: PriceRow[]) {
  if (!rows.length) return null;
  const { error } = await supabase.from("branch_unit_types").upsert(
    rows.map((r) => ({ branch_id: branchId, ...r })),
    { onConflict: "branch_id,unit_type_code" },
  );
  if (!error) return null;
  if (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("schema cache")) {
    return "ยังตั้งราคาแยกสาขาไม่ได้ กรุณารันไฟล์ 0012_branch_prices.sql ใน Supabase ก่อน";
  }
  return thaiError(error, "บันทึกราคาของสาขาไม่สำเร็จ");
}

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
  const prices = readBranchPrices(fd, types ?? []);
  if ("error" in prices) return { error: prices.error };

  const { data: id, error } = await supabase.rpc("create_branch", {
    p_name: name,
    p_address: str(fd, "address"),
    p_phone: str(fd, "phone"),
    p_note: str(fd, "note"),
    p_counts: counts,
  });
  if (error) return { error: thaiError(error, "สร้างสาขาไม่สำเร็จ") };
  const priceError = await saveBranchPrices(supabase, id as string, prices);
  revalidatePath("/", "layout");
  if (priceError) return { error: `สร้างสาขาแล้ว แต่${priceError}` };
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
  const { data: types } = await supabase.from("unit_types").select("code, name");
  const prices = readBranchPrices(fd, types ?? []);
  if ("error" in prices) return { error: prices.error };
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
  const priceError = await saveBranchPrices(supabase, id, prices);
  revalidatePath("/", "layout");
  if (priceError) return { error: priceError };
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
