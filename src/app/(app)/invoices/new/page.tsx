import { FileSignature, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/data";
import { money, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, ContractView } from "@/lib/types";
import { InvoiceForm } from "./invoice-form";

export const metadata: Metadata = { title: "ออกใบวางบิล" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const sp = await searchParams;
  const contractId = typeof sp.contract === "string" ? sp.contract : null;

  if (!contractId) {
    return (
      <>
        <PageHeader title="ออกใบวางบิล" back={{ href: "/invoices", label: "ใบวางบิล" }} />
        <Card>
          <EmptyState
            icon={<FileSignature className="size-6" />}
            title="เลือกสัญญาที่ต้องการออกบิล"
            description="ออกใบวางบิลได้จากรายการ “ถึงรอบออกบิล” หรือจากหน้าสัญญาเช่า"
            action={
              <Link href="/invoices?tab=due" className="btn btn-primary">
                ดูสัญญาที่ถึงรอบ
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: cData }, { data: due }, settings, { data: lastInv }, { data: openData }] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", contractId).maybeSingle(),
    supabase.from("v_billing_due").select("*").eq("contract_id", contractId).maybeSingle(),
    getSettings(),
    // ภาษีตั้งต้น = แบบเดียวกับใบล่าสุดของสัญญานี้
    supabase
      .from("invoices")
      .select("vat_rate, vat_inclusive, wht_rate")
      .eq("contract_id", contractId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // ใบที่ยังค้างชำระ เผื่อผู้ใช้ตั้งใจจะมาพิมพ์ใบเดิม
    supabase
      .from("invoices")
      .select("id, invoice_no, total, period_start")
      .eq("contract_id", contractId)
      .in("status", ["unpaid", "partial"])
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;
  const next = due as BillingDue | null;
  const hasRentCycle = Boolean(next && c.status === "active");
  const openInvoices = (openData ?? []) as {
    id: string;
    invoice_no: string;
    total: number;
    period_start: string | null;
  }[];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={hasRentCycle ? "ออกใบวางบิล" : "ออกบิลค่าใช้จ่ายอื่น"}
        back={{ href: `/contracts/${c.id}`, label: c.contract_no }}
        subtitle={
          <>
            {c.unit_code} · {c.tenant_name} · ค่าเช่า {money(c.monthly_rent)} บาท/เดือน
          </>
        }
      />
      {c.status === "cancelled" ? (
        <Card>
          <EmptyState title="สัญญานี้ถูกยกเลิกแล้ว" description="ไม่สามารถออกใบวางบิลให้สัญญาที่ยกเลิกได้" />
        </Card>
      ) : (
        <>
          {!hasRentCycle && openInvoices.length > 0 && (
            <Card className="mb-4 border-ink/20 bg-brand-soft p-4 sm:p-5">
              <div className="font-semibold">ต้องการพิมพ์ใบวางบิลค่าเช่าที่ออกไปแล้ว?</div>
              <p className="mt-0.5 text-sm text-muted">หน้านี้สำหรับออกบิลใหม่เท่านั้น กดที่ใบด้านล่างเพื่อเปิดดูและพิมพ์</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {openInvoices.map((i) => (
                  <Link key={i.id} href={`/invoices/${i.id}`} className="btn btn-primary btn-sm">
                    <Printer className="size-3.5" /> {i.invoice_no} · {money(i.total)} บาท
                  </Link>
                ))}
              </div>
            </Card>
          )}
          <InvoiceForm
            contractId={c.id}
            unitCode={c.unit_code}
            monthlyRent={Number(c.monthly_rent)}
            nextPeriod={
              next && c.status === "active"
                ? {
                    start: next.period_start,
                    end: next.period_end,
                    months: next.months,
                    partial: next.is_partial,
                  }
                : null
            }
            contractStart={c.start_date}
            contractEnd={c.end_date}
            today={todayTH()}
            defaultTax={{
              vat: Number(lastInv?.vat_rate ?? 0) > 0,
              inclusive: lastInv?.vat_inclusive ?? settings.vat_inclusive ?? true,
              wht: Number(lastInv?.wht_rate ?? 0) > 0,
            }}
            hasTaxId={Boolean(settings.tax_id)}
          />
        </>
      )}
    </div>
  );
}
