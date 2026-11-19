"use server";

import { ownerOnlyError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { thaiError } from "@/lib/errors";
import { num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";
import { readContractTerms } from "@/lib/contract-terms-form";

async function saveSettings(patch: Record<string, unknown>): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(patch).eq("id", 1);
  if (error) return { error: thaiError(error, "บันทึกการตั้งค่าไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function saveBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
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

export async function saveDocuments(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const prefixes = ["invoice_prefix", "receipt_prefix", "contract_prefix"].map((k) => reqStr(fd, k).toUpperCase());
  if (prefixes.some((p) => !/^[A-Z0-9-]{1,10}$/.test(p))) {
    return { error: "คำนำหน้าเลขเอกสารใช้ได้เฉพาะ A–Z, 0–9 และ - ไม่เกิน 10 ตัว" };
  }
  if (new Set(prefixes).size !== 3) return { error: "คำนำหน้าเลขเอกสารแต่ละประเภทต้องไม่ซ้ำกัน" };
  return saveSettings({
    invoice_prefix: prefixes[0],
    receipt_prefix: prefixes[1],
    contract_prefix: prefixes[2],
  });
}

export async function saveAlerts(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const due = num(fd, "due_soon_days");
  const exp = num(fd, "expiring_soon_days");
  if (due === null || !Number.isInteger(due) || due < 0 || due > 90) return { error: "จำนวนวันแจ้งออกบิลล่วงหน้าต้องอยู่ระหว่าง 0–90" };
  if (exp === null || !Number.isInteger(exp) || exp < 1 || exp > 180) return { error: "จำนวนวันแจ้งสัญญาใกล้หมดต้องอยู่ระหว่าง 1–180" };
  return saveSettings({ due_soon_days: due, expiring_soon_days: exp });
}

export async function saveContractSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const r = readContractTerms(fd, false);
  if ("error" in r) return { error: r.error };
  return saveSettings(r.patch);
}

const TEMPLATE_MAX = 30_000;

export async function saveContractTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const kind = reqStr(fd, "kind");
  if (kind !== "storage" && kind !== "parking") return { error: "ประเภทแม่แบบไม่ถูกต้อง" };
  const reset = fd.get("reset") === "1";
  const text = String(fd.get("template") ?? "").replace(/\r\n?/g, "\n").trim();
  if (!reset && !text) return { error: "แม่แบบว่างเปล่า ถ้าต้องการใช้ฉบับตั้งต้นให้กด “คืนค่าแม่แบบเดิม”" };
  if (text.length > TEMPLATE_MAX) return { error: `แม่แบบยาวเกิน ${TEMPLATE_MAX.toLocaleString()} ตัวอักษร` };
  const col = kind === "parking" ? "contract_template_parking" : "contract_template_storage";
  const r = await saveSettings({ [col]: reset ? null : text });
  if (r?.ok) r.message = reset ? "คืนค่าแม่แบบเดิมแล้ว" : "บันทึกแม่แบบแล้ว สัญญาที่พิมพ์ต่อจากนี้ใช้เนื้อหาใหม่ทันที";
  return r;
}

const WATERMARK_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** ลายน้ำบนเอกสาร: ส่งรูปมาเฉพาะตอนเปลี่ยน/ลบ เพื่อไม่ต้องอัปโหลดรูปเดิมซ้ำทุกครั้ง */
export async function saveWatermark(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };

  const patch: Record<string, unknown> = { enabled: fd.get("enabled") === "1", updated_at: new Date().toISOString() };
  if (fd.get("image_changed") === "1") {
    const image = String(fd.get("image") ?? "");
    if (image && (image.length > 2_400_000 || !WATERMARK_RE.test(image))) {
      return { error: "ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป กรุณาเลือกรูปใหม่" };
    }
    patch.image = image || null;
  }
  // slider ที่ถูกปิดไว้จะไม่ถูกส่งมา = คงค่าเดิม
  const opacity = num(fd, "opacity");
  const size = num(fd, "size");
  if (opacity !== null) {
    if (!Number.isInteger(opacity) || opacity < 2 || opacity > 30) return { error: "ความเข้มต้องอยู่ระหว่าง 2–30%" };
    patch.opacity = opacity;
  }
  if (size !== null) {
    if (!Number.isInteger(size) || size < 20 || size > 90) return { error: "ขนาดต้องอยู่ระหว่าง 20–90%" };
    patch.size = size;
  }
  // ตำแหน่ง: ส่งมาเฉพาะเมื่อเลื่อนจากกลางหน้า หรือเคยเลื่อนไว้แล้ว
  if (fd.has("pos_x") && fd.has("pos_y")) {
    const px = num(fd, "pos_x");
    const py = num(fd, "pos_y");
    if (px === null || py === null || px < 0 || px > 100 || py < 0 || py > 100) return { error: "ตำแหน่งลายน้ำไม่ถูกต้อง" };
    patch.pos_x = Math.round(px);
    patch.pos_y = Math.round(py);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("doc_watermark").update(patch).eq("id", 1);
  if (error) {
    if (error.message?.includes("pos_")) return { error: "การเลื่อนตำแหน่งลายน้ำต้องรันไฟล์ 0013_watermark_position.sql ใน Supabase ก่อน" };
    return { error: thaiError(error, "บันทึกลายน้ำไม่สำเร็จ") };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: patch.image === null ? "ลบลายน้ำแล้ว" : "บันทึกลายน้ำแล้ว เอกสารที่พิมพ์ต่อจากนี้จะมีลายน้ำ" };
}
