import "server-only";
import { fetchAll } from "./data";
import { createClient } from "./supabase/server";
import type { InvoiceView, PaymentMethod } from "./types";

export type PaymentRow = {
  id: string;
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
        "id, receipt_no, paid_on, amount, method, reference, is_void, invoices!inner(invoice_no, contracts!inner(contract_no, units!inner(code, branch_id, branches!inner(name)), tenants!inner(full_name)))",
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
