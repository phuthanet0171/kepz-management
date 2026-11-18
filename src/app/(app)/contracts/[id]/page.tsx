import { FilePlus2, Phone, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatusBadge, InvoiceStatusBadge } from "@/components/status";
import { Alert, Card, CardHeader, DefinitionList, PageHeader } from "@/components/ui";
import {
  BILLING_CYCLE_LABEL,
  daysBetween,
  DEPOSIT_TXN_LABEL,
  money,
  PAYMENT_METHOD_LABEL,
  thDate,
  thDateTime,
  todayTH,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, ContractRenewal, ContractView, DepositTxn, InvoiceView } from "@/lib/types";
import { DepositButton, EditContractInfoButton, EndContractButton, RenewContractButton } from "./contract-actions";

export const metadata: Metadata = { title: "สัญญาเช่า" };

export default async function ContractPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: cData }, { data: invData }, { data: depData }, { data: renData }, { data: dueData }, { data: extra }] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_invoices").select("*").eq("contract_id", id).order("issue_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("deposit_transactions").select("*").eq("contract_id", id).order("txn_date").order("created_at"),
    supabase.from("contract_renewals").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabase.from("v_billing_due").select("*").eq("contract_id", id).maybeSingle(),
    supabase.from("contracts").select("purpose, unit:units(unit_type:unit_types(kind))").eq("id", id).maybeSingle(),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;
  const invoices = (invData ?? []) as InvoiceView[];
  const deposits = (depData ?? []) as DepositTxn[];
  const renewals = (renData ?? []) as ContractRenewal[];
  const nextBill = dueData as BillingDue | null;
  const today = todayTH();
  const daysLeft = daysBetween(today, c.end_date);
  const active = c.status === "active";
  const purpose = (extra?.purpose as string | null) ?? null;
  const unitRel = extra?.unit as unknown as { unit_type: { kind: string } | null } | null;
  const isParking = unitRel?.unit_type?.kind === "parking";

  return (
    <>
      <PageHeader
        back={{ href: "/contracts", label: "สัญญาเช่า" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.contract_no} <ContractStatusBadge status={c.status} expiring={c.is_expiring} />
          </span>
        }
        subtitle={`${c.unit_code} · ${c.unit_type_name} · ${c.branch_name}`}
        actions={
          <>
            <Link href={`/print/contract/${c.id}`} target="_blank" className="btn btn-outline">
              <Printer className="size-4" /> พิมพ์สัญญา
            </Link>
            <Link href={`/invoices/new?contract=${c.id}`} className="btn btn-primary">
              <FilePlus2 className="size-4" /> ออกใบแจ้งหนี้
            </Link>
          </>
        }
      />

      {sp.created === "1" && (
        <Alert tone={sp.invoice === "partial" || sp.invoice === "fail" ? "warn" : "ok"} className="mb-4">
          {sp.invoice === "ok"
            ? "สร้างสัญญาและใบแจ้งหนี้ค่าเช่างวดแรกเรียบร้อยแล้ว พิมพ์สัญญาได้จากปุ่มด้านบน"
            : sp.invoice === "partial"
              ? "สร้างสัญญาแล้ว แต่สัญญาสั้นกว่า 1 รอบชำระ ระบบจึงไม่ออกบิลอัตโนมัติ กรุณากด “ออกใบแจ้งหนี้” เพื่อตรวจยอดเอง"
              : sp.invoice === "fail"
                ? "สร้างสัญญาแล้ว แต่ออกใบแจ้งหนี้งวดแรกไม่สำเร็จ กรุณากด “ออกใบแจ้งหนี้” เพื่อออกเอง"
                : "สร้างสัญญาเรียบร้อยแล้ว ขั้นต่อไปคือออกใบแจ้งหนี้รอบแรก"}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="รายละเอียดสัญญา" />
            <div className="p-4 sm:p-5">
              <DefinitionList
                items={[
                  {
                    label: "ผู้เช่า",
                    value: (
                      <Link href={`/tenants/${c.tenant_id}`} className="underline">
                        {c.tenant_name}
                      </Link>
                    ),
                  },
                  {
                    label: "เบอร์โทร",
                    value: (
                      <a href={`tel:${c.tenant_phone}`} className="inline-flex items-center gap-1 underline">
                        <Phone className="size-3.5" /> {c.tenant_phone}
                      </a>
                    ),
                  },
                  {
                    label: "ห้อง",
                    value: (
                      <Link href={`/units/${c.unit_id}`} className="underline">
                        {c.unit_code}
                      </Link>
                    ),
                  },
                  { label: isParking ? "ทะเบียนรถ" : "เพื่อใช้เก็บ", value: purpose ?? "-" },
                  { label: "ค่าเช่าต่อเดือน", value: `${money(c.monthly_rent)} บาท` },
                  { label: "วันเริ่มสัญญา", value: thDate(c.start_date) },
                  {
                    label: "วันสิ้นสุดสัญญา",
                    value: (
                      <>
                        {thDate(c.end_date)}
                        {active && (
                          <span className={`block text-xs ${daysLeft <= 30 ? "text-warn" : "text-muted"}`}>
                            {daysLeft >= 0 ? `อีก ${daysLeft} วัน` : `เลยมา ${-daysLeft} วัน`}
                          </span>
                        )}
                      </>
                    ),
                  },
                  { label: "รอบการชำระ", value: BILLING_CYCLE_LABEL[c.billing_cycle] },
                  {
                    label: "ยอดค้างชำระ",
                    value: <span className={Number(c.outstanding) > 0 ? "text-bad" : "text-ok"}>{money(c.outstanding)} บาท</span>,
                  },
                  ...(c.status !== "active"
                    ? [
                        { label: "วันที่ย้ายออก", value: thDate(c.ended_on) },
                        { label: "เหตุผล", value: c.end_reason ?? "-" },
                      ]
                    : []),
                  ...(c.note ? [{ label: "หมายเหตุ", value: c.note, full: true }] : []),
                ]}
              />
              {active && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <EditContractInfoButton id={c.id} purpose={purpose} note={c.note} isParking={isParking} />
                  <RenewContractButton contract={c} />
                  <EndContractButton contract={c} today={today} />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="ใบแจ้งหนี้"
              description={
                nextBill
                  ? `รอบถัดไป ${thDate(nextBill.period_start)} – ${thDate(nextBill.period_end)}`
                  : active
                    ? "ออกใบแจ้งหนี้ค่าเช่าครบทุกรอบแล้ว"
                    : undefined
              }
              action={
                <Link href={`/invoices/new?contract=${c.id}`} className="btn btn-outline btn-sm">
                  <FilePlus2 className="size-3.5" /> ออกบิล
                </Link>
              }
            />
            {invoices.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่มีใบแจ้งหนี้</p>
            ) : (
              <ul className="divide-y divide-line">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5">
                      <div className="min-w-0">
                        <div className={`font-medium ${i.status === "void" ? "text-muted line-through" : ""}`}>{i.invoice_no}</div>
                        <div className="text-xs text-muted">
                          {i.period_start ? `รอบ ${thDate(i.period_start)} – ${thDate(i.period_end)}` : "ค่าใช้จ่ายอื่น"} · ครบกำหนด{" "}
                          {thDate(i.due_date)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular font-semibold">{money(i.total)}</span>
                        <InvoiceStatusBadge status={i.status} overdue={i.is_overdue} days={i.days_overdue} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="เงินประกัน"
              action={(Number(c.deposit_amount) > 0 || Number(c.deposit_balance) > 0) && <DepositButton contract={c} today={today} />}
            />
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-canvas p-3">
                  <div className="text-xs text-muted">ตามสัญญา</div>
                  <div className="tabular font-bold">{money(c.deposit_amount)}</div>
                </div>
                <div className="rounded-xl bg-brand-soft p-3">
                  <div className="text-xs text-muted">คงเหลือที่ถือไว้</div>
                  <div className="tabular font-bold">{money(c.deposit_balance)}</div>
                </div>
              </div>
              {deposits.length > 0 && (
                <ul className="mt-4 space-y-2.5 text-sm">
                  {deposits.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{DEPOSIT_TXN_LABEL[d.txn_type]}</div>
                        <div className="truncate text-xs text-muted">
                          {thDate(d.txn_date)}
                          {d.method && ` · ${PAYMENT_METHOD_LABEL[d.method]}`}
                          {d.note && ` · ${d.note}`}
                        </div>
                      </div>
                      <span className={`tabular shrink-0 font-medium ${d.txn_type === "receive" ? "text-ok" : "text-bad"}`}>
                        {d.txn_type === "receive" ? "+" : "−"}
                        {money(d.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {renewals.length > 0 && (
            <Card>
              <CardHeader title="ประวัติการต่อสัญญา" />
              <ul className="divide-y divide-line text-sm">
                {renewals.map((r) => (
                  <li key={r.id} className="px-4 py-3 sm:px-5">
                    <div>
                      {thDate(r.previous_end_date)} → <b>{thDate(r.new_end_date)}</b>
                    </div>
                    <div className="text-xs text-muted">
                      ค่าเช่า {money(r.previous_rent)} → {money(r.new_rent)} · บันทึก {thDateTime(r.created_at)}
                    </div>
                    {r.note && <div className="text-xs text-muted">{r.note}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
