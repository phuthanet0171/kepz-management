"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { isDate, isMoney, num, reqStr, str } from "@/lib/form";
import { thDate, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { TaxChoice } from "@/lib/tax";
import type { ActionState, BillingDue, ItemType } from "@/lib/types";

const ITEM_TYPES: ItemType[] = ["rent", "late_fee", "other", "discount"];

type ItemInput = { item_type: ItemType; description: string; quantity: number; unit_price: number };

export async function createInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const contractId = reqStr(fd, "contract_id");
  const hasPeriod = fd.get("has_period") === "on";
  const periodStart = hasPeriod ? str(fd, "period_start") : null;
  const periodEnd = hasPeriod ? str(fd, "period_end") : null;
  const issue = str(fd, "issue_date");
  const due = str(fd, "due_date");

  if (hasPeriod && (!isDate(periodStart) || !isDate(periodEnd))) return { error: "กรุณาระบุรอบบิลให้ครบ" };
  if (hasPeriod && periodEnd! < periodStart!) return { error: "วันสิ้นสุดรอบบิลต้องไม่ก่อนวันเริ่ม" };
  if (!isDate(issue)) return { error: "กรุณาระบุวันที่ออกบิล" };
  if (!isDate(due)) return { error: "กรุณาระบุวันครบกำหนดชำระ" };
  if (due < issue) return { error: "วันครบกำหนดต้องไม่ก่อนวันที่ออกบิล" };

  let items: ItemInput[];
  try {
    const raw = JSON.parse(String(fd.get("items") ?? "[]")) as unknown[];
    items = raw.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        item_type: o.item_type as ItemType,
        description: String(o.description ?? "").trim(),
        quantity: Number(o.quantity),
        unit_price: Number(o.unit_price),
      };
    });
  } catch {
    return { error: "รายการในบิลไม่ถูกต้อง" };
  }

  if (items.length === 0) return { error: "ต้องมีรายการอย่างน้อย 1 รายการ" };
  for (const [i, it] of items.entries()) {
    const row = `รายการที่ ${i + 1}`;
    if (!ITEM_TYPES.includes(it.item_type)) return { error: `${row}: ประเภทไม่ถูกต้อง` };
    if (!it.description) return { error: `${row}: กรุณากรอกรายละเอียด` };
    if (!(it.quantity > 0) || !Number.isFinite(it.quantity)) return { error: `${row}: จำนวนต้องมากกว่า 0` };
    if (!isMoney(it.unit_price, { allowZero: false })) return { error: `${row}: ราคาต้องมากกว่า 0` };
  }
  if (items.some((i) => i.item_type === "rent") && !hasPeriod) {
    return { error: "รายการค่าเช่าต้องระบุรอบบิล" };
  }

  const tax = readTax(fd);
  const supabase = await createClient();
  const taxError = await vatNeedsTaxId(supabase, tax.vat);
  if (taxError) return { error: taxError };
  const { data: id, error } = await supabase.rpc("create_invoice", {
    p_contract_id: contractId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_issue_date: issue,
    p_due_date: due,
    p_items: items,
    p_note: str(fd, "note"),
    p_vat: tax.vat,
    p_vat_inclusive: tax.inclusive,
    p_wht: tax.wht,
  });
  if (error) return { error: thaiError(error, "ออกใบวางบิลไม่สำเร็จ") };

  revalidatePath("/", "layout");
  redirect(`/invoices/${id}`);
}

function readTax(fd: FormData): TaxChoice {
  return { vat: fd.get("vat") === "1", inclusive: fd.get("vat_inclusive") !== "0", wht: fd.get("wht") === "1" };
}

/** ใบที่มี VAT ต้องมีเลขผู้เสียภาษีของกิจการ เพราะใบเสร็จจะเป็นใบกำกับภาษี */
async function vatNeedsTaxId(supabase: Awaited<ReturnType<typeof createClient>>, vat: boolean) {
  if (!vat) return null;
  const { data } = await supabase.from("settings").select("tax_id").eq("id", 1).single();
  return data?.tax_id ? null : "กรุณากรอกเลขประจำตัวผู้เสียภาษีของกิจการก่อน (ตั้งค่า → ข้อมูลกิจการ) จึงจะออกบิลแบบมี VAT ได้";
}

/** เปลี่ยนภาษีของใบที่ยังไม่มีการรับชำระ (ก่อนพิมพ์/ส่งให้ลูกค้า) */
export async function setInvoiceTax(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const tax = readTax(fd);
  const supabase = await createClient();
  const taxError = await vatNeedsTaxId(supabase, tax.vat);
  if (taxError) return { error: taxError };
  const { error } = await supabase.rpc("set_invoice_tax", {
    p_invoice_id: id,
    p_vat: tax.vat,
    p_vat_inclusive: tax.inclusive,
    p_wht: tax.wht,
  });
  if (error) return { error: thaiError(error, "บันทึกภาษีไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกภาษีแล้ว พิมพ์ใบวางบิลได้เลย" };
}

/** ออกใบวางบิลค่าเช่ารอบถัดไปให้หลายสัญญาพร้อมกัน (ยอด = ค่าเช่าต่อเดือน × จำนวนเดือนในรอบ) */
export async function createInvoicesBulk(_: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("contract_id").map(String).filter(Boolean);
  if (ids.length === 0) return { error: "กรุณาเลือกสัญญาอย่างน้อย 1 รายการ" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("v_billing_due").select("*").in("contract_id", ids);
  if (error) return { error: thaiError(error) };

  const today = todayTH();
  const failed: string[] = [];
  let created = 0;

  for (const b of (data ?? []) as BillingDue[]) {
    if (b.is_partial) {
      failed.push(`${b.unit_code}: รอบไม่เต็ม ต้องออกบิลทีละรายการเพื่อตรวจยอด`);
      continue;
    }
    const { error: e } = await supabase.rpc("create_invoice", {
      p_contract_id: b.contract_id,
      p_period_start: b.period_start,
      p_period_end: b.period_end,
      p_issue_date: today,
      p_due_date: b.period_start > today ? b.period_start : today,
      p_items: [
        {
          item_type: "rent",
          description: `ค่าเช่า ${b.unit_code} (${thDate(b.period_start)} – ${thDate(b.period_end)})`,
          quantity: b.months,
          unit_price: b.monthly_rent,
        },
      ],
      p_note: null,
    });
    if (e) failed.push(`${b.unit_code}: ${thaiError(e)}`);
    else created++;
  }

  revalidatePath("/", "layout");
  if (failed.length) {
    return {
      ok: created > 0,
      error: `ออกบิลสำเร็จ ${created} รายการ ไม่สำเร็จ ${failed.length} รายการ — ${failed.join(" / ")}`,
    };
  }
  return { ok: true, message: `ออกใบวางบิลสำเร็จ ${created} รายการ` };
}

export async function voidInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const reason = str(fd, "reason");
  if (!reason) return { error: "กรุณาระบุเหตุผลการยกเลิก" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_invoice_id: id, p_reason: reason });
  if (error) return { error: thaiError(error, "ยกเลิกใบวางบิลไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recordPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const invoiceId = reqStr(fd, "invoice_id");
  const amount = num(fd, "amount");
  const paidOn = str(fd, "paid_on");
  const method = reqStr(fd, "method");

  if (!isMoney(amount, { allowZero: false })) return { error: "ยอดชำระต้องมากกว่า 0" };
  if (!isDate(paidOn)) return { error: "กรุณาระบุวันที่ชำระ" };
  if (paidOn > todayTH()) return { error: "วันที่ชำระต้องไม่เป็นวันในอนาคต" };
  if (!["transfer", "credit_card"].includes(method)) return { error: "กรุณาเลือกช่องทางชำระ" };

  const slipPath = str(fd, "slip_path");
  if (slipPath && !slipPath.startsWith(`${invoiceId}/`)) return { error: "ไฟล์สลิปไม่ถูกต้อง" };

  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("record_payment", {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_paid_on: paidOn,
    p_method: method,
    p_reference: str(fd, "reference"),
    p_slip_path: slipPath,
    p_note: str(fd, "note"),
  });
  if (error) return { error: thaiError(error, "บันทึกการชำระไม่สำเร็จ") };

  revalidatePath("/", "layout");
  // เปิดใบเสร็จให้พิมพ์ทันที (ใช้ redirect ฝั่งเซิร์ฟเวอร์ เพราะปุ่มรับชำระจะหายไปเมื่อบิลชำระครบ)
  redirect(`/print/receipt/${paymentId}?print=1`);
}

export async function voidPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const reason = str(fd, "reason");
  if (!reason) return { error: "กรุณาระบุเหตุผลการยกเลิก" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_payment", { p_payment_id: id, p_reason: reason });
  if (error) return { error: thaiError(error, "ยกเลิกใบเสร็จไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}
