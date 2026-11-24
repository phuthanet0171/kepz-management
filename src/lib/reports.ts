import "server-only";
import { fetchAll } from "./data";
import { createClient } from "./supabase/server";
import type { InvoiceView, PaymentMethod } from "./types";

export type PaymentRow = {
  id: string;
  invoice_id: string;
  created_at: string;
  receipt_no: string;
  paid_on: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  is_void: boolean;
  invoices: {
    invoice_no: string;
    contracts: { contract_no: string; units: { code: string; branch_id: string; branches: { name: string } }; tenants: { full_name: string } };
  };
};

export async function getPaymentsInRange(from: string, toExclusive: string) {
  const supabase = await createClient();
  return fetchAll<PaymentRow>((a, b) =>
    supabase
      .from("payments")
      .select(
        "id, invoice_id, created_at, receipt_no, paid_on, amount, method, reference, is_void, invoices!inner(invoice_no, contracts!inner(contract_no, units!inner(code, branch_id, branches!inner(name)), tenants!inner(full_name)))",
      )
      .gte("paid_on", from)
      .lt("paid_on", toExclusive)
      .order("paid_on")
      .order("receipt_no")
      .range(a, b),
  );
}

export async function getInvoicesInRange(from: string, toExclusive: string) {
  const supabase = await createClient();
  return fetchAll<InvoiceView>((a, b) =>
    supabase
      .from("v_invoices")
      .select("*")
      .gte("issue_date", from)
      .lt("issue_date", toExclusive)
      .order("issue_date")
      .order("invoice_no")
      .range(a, b),
  );
}

export async function getOutstanding() {
  const supabase = await createClient();
  return fetchAll<InvoiceView>((a, b) =>
    supabase.from("v_invoices").select("*").in("status", ["unpaid", "partial"]).order("due_date").order("id").range(a, b),
  );
}

export function agingBucket(i: Pick<InvoiceView, "is_overdue" | "days_overdue">) {
  if (!i.is_overdue) return "ยังไม่ถึงกำหนด";
  if (i.days_overdue <= 30) return "เกิน 1–30 วัน";
  if (i.days_overdue <= 60) return "เกิน 31–60 วัน";
  if (i.days_overdue <= 90) return "เกิน 61–90 วัน";
  return "เกิน 90 วัน";
}

export const AGING_BUCKETS = ["ยังไม่ถึงกำหนด", "เกิน 1–30 วัน", "เกิน 31–60 วัน", "เกิน 61–90 วัน", "เกิน 90 วัน"];

function chunks<T>(xs: T[], n = 150) {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
}

/** ยอดเงินประกันในแต่ละใบวางบิล (เฉพาะบิลที่มีรายการเงินประกัน) */
export async function depositByInvoice(invoiceIds: string[]) {
  const supabase = await createClient();
  const dep = new Map<string, number>();
  for (const ids of chunks([...new Set(invoiceIds)])) {
    const items = await fetchAll<{ invoice_id: string; amount: number }>((a, b) =>
      supabase.from("invoice_items").select("invoice_id, amount").eq("item_type", "deposit").in("invoice_id", ids).order("id").range(a, b),
    );
    for (const it of items) dep.set(it.invoice_id, (dep.get(it.invoice_id) ?? 0) + Number(it.amount));
  }
  return dep;
}

/**
 * ส่วนที่เป็นเงินประกันของแต่ละใบเสร็จ (คีย์ = payment id)
 * บิลที่มีเงินประกัน ยอดที่ชำระนับเป็นเงินประกันก่อน ไล่ตามลำดับการชำระทั้งหมดของบิลนั้น
 * ตรงกับที่ฐานข้อมูลบันทึกรับเงินประกัน (0016) — ส่วนที่เหลือคือค่าเช่าและรายการอื่น
 */
export async function depositShares(payments: { invoice_id: string }[]) {
  const share = new Map<string, number>();
  const depByInv = await depositByInvoice(payments.map((p) => p.invoice_id));
  if (depByInv.size === 0) return share;
  const supabase = await createClient();
  for (const ids of chunks([...depByInv.keys()])) {
    const all = await fetchAll<{ id: string; invoice_id: string; paid_on: string; amount: number; created_at: string }>((a, b) =>
      supabase
        .from("payments")
        .select("id, invoice_id, paid_on, amount, created_at")
        .eq("is_void", false)
        .in("invoice_id", ids)
        .order("id")
        .range(a, b),
    );
    all.sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));
    const left = new Map(ids.map((id) => [id, depByInv.get(id) ?? 0]));
    for (const p of all) {
      const rest = left.get(p.invoice_id) ?? 0;
      const part = Math.min(Number(p.amount), rest);
      if (part > 0) {
        share.set(p.id, part);
        left.set(p.invoice_id, rest - part);
      }
    }
  }
  return share;
}
