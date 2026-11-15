import { FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/data";
import { money, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, ContractView } from "@/lib/types";
import { InvoiceForm } from "./invoice-form";

export const metadata: Metadata = { title: "ออกใบแจ้งหนี้" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const sp = await searchParams;
  const contractId = typeof sp.contract === "string" ? sp.contract : null;

  if (!contractId) {
    return (
      <>
        <PageHeader title="ออกใบแจ้งหนี้" back={{ href: "/invoices", label: "ใบแจ้งหนี้" }} />
        <Card>
          <EmptyState
            icon={<FileSignature className="size-6" />}
            title="เลือกสัญญาที่ต้องการออกบิล"
            description="ออกบิลได้จากรายการ “ถึงรอบออกบิล” หรือจากหน้าสัญญาเช่า"
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
  const [{ data: cData }, { data: due }, settings] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", contractId).maybeSingle(),
    supabase.from("v_billing_due").select("*").eq("contract_id", contractId).maybeSingle(),
    getSettings(),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;
  const next = due as BillingDue | null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="ออกใบแจ้งหนี้"
        back={{ href: `/contracts/${c.id}`, label: c.contract_no }}
        subtitle={
          <>
            {c.unit_code} · {c.tenant_name} · ค่าเช่า {money(c.monthly_rent)} บาท/เดือน
          </>
        }
      />
      {c.status === "cancelled" ? (
        <Card>
          <EmptyState title="สัญญานี้ถูกยกเลิกแล้ว" description="ไม่สามารถออกใบแจ้งหนี้ให้สัญญาที่ยกเลิกได้" />
        </Card>
      ) : (
        <InvoiceForm
          contractId={c.id}
          unitCode={c.unit_code}
          monthlyRent={Number(c.monthly_rent)}
          nextPeriod={
            next && c.status === "active"
              ? { start: next.period_start, end: next.period_end, months: next.months, partial: next.is_partial }
              : null
          }
          contractStart={c.start_date}
          contractEnd={c.end_date}
          today={todayTH()}
          vat={{ enabled: settings.vat_enabled, rate: Number(settings.vat_rate), inclusive: settings.vat_inclusive }}
        />
      )}
    </div>
  );
}
