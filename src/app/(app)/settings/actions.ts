"use server";

import { revalidatePath } from "next/cache";
import { thaiError } from "@/lib/errors";
import { bool, isMoney, num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

async function saveSettings(patch: Record<string, unknown>): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(patch).eq("id", 1);
  if (error) return { error: thaiError(error, "บันทึกการตั้งค่าไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function saveBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = reqStr(fd, "business_name");
  if (!name) return { error: "กรุณากรอกชื่อกิจการ" };
  const taxId = str(fd, "tax_id")?.replace(/[\s-]/g, "") ?? null;
  if (taxId && !/^\d{13}$/.test(taxId)) return { error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" };
  return saveSettings({
    business_name: name,
    business_address: str(fd, "business_address"),
    business_phone: str(fd, "business_phone"),
    business_email: str(fd, "business_email"),
    tax_id: taxId,
  });
}

export async function saveVat(_: ActionState, fd: FormData): Promise<ActionState> {
  const enabled = bool(fd, "vat_enabled");
  const rate = num(fd, "vat_rate") ?? 7;
  if (!Number.isFinite(rate) || rate < 0 || rate > 30) return { error: "อัตราภาษีต้องอยู่ระหว่าง 0–30%" };
  if (enabled) {
    const supabase = await createClient();
    const { data } = await supabase.from("settings").select("tax_id").eq("id", 1).single();
    if (!data?.tax_id) return { error: "กรุณากรอกเลขประจำตัวผู้เสียภาษีของกิจการก่อนเปิดใช้ VAT" };
  }
  return saveSettings({
    vat_enabled: enabled,
    vat_rate: rate,
    vat_inclusive: fd.get("vat_inclusive") !== "exclusive",
  });
}

export async function saveDocuments(_: ActionState, fd: FormData): Promise<ActionState> {
  const prefixes = ["invoice_prefix", "receipt_prefix", "contract_prefix"].map((k) => reqStr(fd, k).toUpperCase());
  if (prefixes.some((p) => !/^[A-Z0-9-]{1,10}$/.test(p))) {
    return { error: "คำนำหน้าเลขเอกสารใช้ได้เฉพาะ A–Z, 0–9 และ - ไม่เกิน 10 ตัว" };
  }
  if (new Set(prefixes).size !== 3) return { error: "คำนำหน้าเลขเอกสารแต่ละประเภทต้องไม่ซ้ำกัน" };
  return saveSettings({
    invoice_prefix: prefixes[0],
    receipt_prefix: prefixes[1],
    contract_prefix: prefixes[2],
    payment_instructions: str(fd, "payment_instructions"),
    contract_terms: str(fd, "contract_terms"),
  });
}

export async function saveAlerts(_: ActionState, fd: FormData): Promise<ActionState> {
  const due = num(fd, "due_soon_days");
  const exp = num(fd, "expiring_soon_days");
  if (due === null || !Number.isInteger(due) || due < 0 || due > 90) return { error: "จำนวนวันแจ้งออกบิลล่วงหน้าต้องอยู่ระหว่าง 0–90" };
  if (exp === null || !Number.isInteger(exp) || exp < 1 || exp > 180) return { error: "จำนวนวันแจ้งสัญญาใกล้หมดต้องอยู่ระหว่าง 1–180" };
  return saveSettings({ due_soon_days: due, expiring_soon_days: exp });
}

export async function saveUnitTypes(_: ActionState, fd: FormData): Promise<ActionState> {
  const codes = fd.getAll("code").map(String);
  const supabase = await createClient();
  for (const code of codes) {
    const name = reqStr(fd, `name_${code}`);
    const price = num(fd, `price_${code}`);
    if (!name) return { error: `กรุณากรอกชื่อประเภท ${code}` };
    if (!isMoney(price)) return { error: `ราคาของ ${name} ไม่ถูกต้อง` };
    const { error } = await supabase
      .from("unit_types")
      .update({ name, size_label: str(fd, `size_${code}`), default_monthly_price: price })
      .eq("code", code);
    if (error) return { error: thaiError(error, "บันทึกราคาไม่สำเร็จ") };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกราคาแล้ว ใช้กับสัญญาใหม่เท่านั้น สัญญาเดิมยังใช้ราคาเดิม" };
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
