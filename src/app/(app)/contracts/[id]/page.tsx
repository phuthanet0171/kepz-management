import { FilePlus2, Phone, Printer, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatusBadge, InvoiceStatusBadge } from "@/components/status";
import { Alert, Card, CardHeader, DefinitionList, PageHeader } from "@/components/ui";
import { BILLING_CYCLE_LABEL, daysBetween, money, thDate, thDateTime, todayTH } from "@/lib/format";
import { fetchAll } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, ContractRenewal, ContractView, InvoiceView } from "@/lib/types";
import {
  DepositButton,
  EditContractInfoButton,
  EndContractButton,
  RenewContractButton,
  type EditTenantOption,
  type EditUnitOption,
} from "./contract-actions";

export const metadata: Metadata = { title: "สัญญาเช่า" };

export default async function ContractPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: cData }, { data: invData }, { data: renData }, { data: dueData }, { data: extra }] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("v_invoices")
      .select("*")
      .eq("contract_id", id)
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("contract_renewals").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    supabase.from("v_billing_due").select("*").eq("contract_id", id).maybeSingle(),
    supabase.from("contracts").select("purpose, unit:units(unit_type:unit_types(kind))").eq("id", id).maybeSingle(),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;
  const invoices = (invData ?? []) as InvoiceView[];
  const renewals = (renData ?? []) as ContractRenewal[];
  const nextBill = dueData as BillingDue | null;
  const today = todayTH();
  const daysLeft = daysBetween(today, c.end_date);
  const active = c.status === "active";
  const purpose = (extra?.purpose as string | null) ?? null;
  const unitRel = extra?.unit as unknown as { unit_type: { kind: string } | null } | null;
  const isParking = unitRel?.unit_type?.kind === "parking";
  // "ออกบิลสัญญานี้" → หน้าใบวางบิลที่พิมพ์ใบวางบิล/รับชำระ/พิมพ์ใบเสร็จได้: บิลค้างที่เก่าที่สุด ถ้าไม่มีค้างใช้บิลล่าสุด
  const openBills = invoices.filter((i) => i.status === "unpaid" || i.status === "partial");
  const billTarget = openBills[openBills.length - 1] ?? invoices.find((i) => i.status !== "void") ?? null;
  const depositReceived = Number(c.deposit_balance);
  // ยังไม่มีการรับชำระ = แก้ผู้เช่า ห้อง ยอดเงิน วันที่ ได้
  const canEditCore = active && !invoices.some((i) => i.status !== "void" && Number(i.paid_amount) > 0);
  const [editUnits, editTenants] = canEditCore
    ? await Promise.all([
        fetchAll<EditUnitOption & { status: string; type_sort: number }>((from, to) =>
          supabase
            .from("v_units")
            .select("id, code, branch_name, unit_type_name, effective_price, status, type_sort")
            .or(`status.eq.available,id.eq.${c.unit_id}`)
            .order("branch_name")
            .order("type_sort")
            .order("code")
            .range(from, to),
        ),
        fetchAll<EditTenantOption>((from, to) =>
          supabase.from("tenants").select("id, full_name, phone").order("full_name").range(from, to),
        ),
      ])
    : [[], []];
  const depositAmount = Number(c.deposit_amount);

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
            {billTarget && (
              <Link href={`/invoices/${billTarget.id}`} className="btn btn-primary">
                <ReceiptText className="size-4" /> ออกบิลสัญญานี้
              </Link>
            )}
            {active && nextBill && (
              <Link href={`/invoices/new?contract=${c.id}`} className={billTarget ? "btn btn-outline" : "btn btn-primary"}>
                <FilePlus2 className="size-4" /> ออกบิลรอบถัดไป
              </Link>
            )}
          </>
        }
      />

      {sp.created === "1" && (
        <Alert tone={sp.invoice === "partial" || sp.invoice === "fail" ? "warn" : "ok"} className="mb-4">
          {sp.invoice === "ok"
            ? "สร้างสัญญาและใบวางบิลค่าเช่างวดแรกเรียบร้อยแล้ว พิมพ์สัญญาได้จากปุ่มด้านบน"
            : sp.invoice === "partial"
              ? "สร้างสัญญาแล้ว แต่สัญญาสั้นกว่า 1 รอบชำระ ระบบจึงไม่ออกบิลอัตโนมัติ กรุณากด “ออกใบวางบิล” เพื่อตรวจยอดเอง"
              : sp.invoice === "fail"
                ? "สร้างสัญญาแล้ว แต่ออกใบวางบิลงวดแรกไม่สำเร็จ กรุณากด “ออกใบวางบิล” เพื่อออกเอง"
                : "สร้างสัญญาเรียบร้อยแล้ว ขั้นต่อไปคือออกใบวางบิลรอบแรก"}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                  {
                    label: "เงินประกัน",
                    value: (
                      <>
                        {money(depositAmount)} บาท
                        {depositAmount > 0 && (
                          <span className={`block text-xs ${depositReceived > 0 ? "text-ok" : "text-muted"}`}>
                            {depositReceived > 0 ? `รับแล้ว · ถือไว้ ${money(depositReceived)} บาท` : "ยังไม่ได้รับ · รับพร้อมใบวางบิลแรก"}
                          </span>
                        )}
                      </>
                    ),
                  },
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
              {!active && depositReceived > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <span className="text-sm text-warn">ยังถือเงินประกันไว้ {money(depositReceived)} บาท</span>
                  <DepositButton contract={c} today={today} label="คืน / หักเงินประกัน" />
                </div>
              )}
              {active && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <EditContractInfoButton
                    contract={c}
                    purpose={purpose}
                    isParking={isParking}
                    canEditCore={canEditCore}
                    units={editUnits}
                    tenants={editTenants}
                    openBills={openBills.map((i) => i.invoice_no)}
                  />
                  <RenewContractButton contract={c} />
                  <EndContractButton contract={c} today={today} />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="ใบวางบิล"
              description={
                nextBill
                  ? `รอบถัดไป ${thDate(nextBill.period_start)} – ${thDate(nextBill.period_end)}`
                  : invoices.length
                    ? "ออกบิลค่าเช่าครบทุกรอบแล้ว · กดที่ใบวางบิลด้านล่างเพื่อดูและพิมพ์"
                    : undefined
              }
              action={
                nextBill ? undefined : (
                  <Link
                    href={`/invoices/new?contract=${c.id}`}
                    className="btn btn-outline btn-sm"
                    title="บิลแยกสำหรับค่าปรับ ค่าเสียหาย หรือค่าใช้จ่ายอื่นที่ไม่ใช่ค่าเช่า"
                  >
                    <FilePlus2 className="size-3.5" /> บิลค่าใช้จ่ายอื่น
                  </Link>
                )
              }
            />
            {invoices.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่มีใบวางบิล</p>
            ) : (
              <ul className="divide-y divide-line">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/invoices/${i.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className={`font-medium ${i.status === "void" ? "text-muted line-through" : ""}`}>
                          {i.invoice_no}
                        </div>
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
