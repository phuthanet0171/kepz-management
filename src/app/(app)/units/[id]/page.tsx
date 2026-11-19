import { FilePlus2, FileSignature, Phone, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatusBadge, UnitStatusBadge } from "@/components/status";
import { Alert, Card, CardHeader, DefinitionList, EmptyState, PageHeader } from "@/components/ui";
import { isOwner } from "@/lib/auth";
import { getUnitTypes } from "@/lib/data";
import { baht, BILLING_CYCLE_LABEL, daysBetween, money, thDate, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContractView, UnitView } from "@/lib/types";
import { DeleteUnitButton, EditUnitButton } from "./unit-actions";

export const metadata: Metadata = { title: "รายละเอียดห้อง" };

export default async function UnitPage({ params }: PageProps<"/units/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: unitData }, { data: history }, unitTypes] = await Promise.all([
    supabase.from("v_units").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_contracts").select("*").eq("unit_id", id).order("start_date", { ascending: false }),
    getUnitTypes(),
  ]);
  if (!unitData) notFound();
  const owner = await isOwner();
  const unit = unitData as UnitView;
  const contracts = (history ?? []) as ContractView[];
  const current = contracts.find((c) => c.status === "active");

  let lastPayment: { paid_on: string; amount: number } | null = null;
  if (current) {
    const { data } = await supabase
      .from("payments")
      .select("paid_on, amount, invoices!inner(contract_id)")
      .eq("invoices.contract_id", current.id)
      .eq("is_void", false)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastPayment = data ? { paid_on: data.paid_on, amount: data.amount } : null;
  }

  const today = todayTH();
  const daysLeft = current ? daysBetween(today, current.end_date) : 0;

  return (
    <>
      <PageHeader
        back={{ href: `/units?branch=${unit.branch_id}`, label: "ห้องและที่จอด" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {unit.code} <UnitStatusBadge status={unit.status} expiring={unit.is_expiring} />
          </span>
        }
        subtitle={`${unit.unit_type_name} · ${unit.branch_name}`}
        actions={<EditUnitButton unit={unit} unitTypes={unitTypes} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {current ? (
            <Card>
              <CardHeader
                title="ผู้เช่าปัจจุบัน"
                action={<ContractStatusBadge status={current.status} expiring={current.is_expiring} />}
              />
              <div className="p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/tenants/${current.tenant_id}`} className="text-xl font-semibold hover:underline">
                      {current.tenant_name}
                    </Link>
                    <a
                      href={`tel:${current.tenant_phone}`}
                      className="mt-0.5 flex items-center gap-1.5 text-sm text-muted hover:text-ink"
                    >
                      <Phone className="size-3.5" /> {current.tenant_phone}
                    </a>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-2xl font-bold">{baht(current.monthly_rent)}</div>
                    <div className="text-xs text-muted">ต่อเดือน · ชำระ{BILLING_CYCLE_LABEL[current.billing_cycle]}</div>
                  </div>
                </div>

                <DefinitionList
                  items={[
                    { label: "เลขที่สัญญา", value: <Link href={`/contracts/${current.id}`} className="underline">{current.contract_no}</Link> },
                    { label: "ระยะสัญญา", value: `${thDate(current.start_date)} – ${thDate(current.end_date)}` },
                    {
                      label: "สัญญาหมดใน",
                      value: (
                        <span className={daysLeft <= 30 ? "text-warn" : undefined}>
                          {daysLeft >= 0 ? `${daysLeft} วัน` : `เลยกำหนด ${-daysLeft} วัน`}
                        </span>
                      ),
                    },
                    {
                      label: "ชำระล่าสุด",
                      value: lastPayment ? `${thDate(lastPayment.paid_on)} (${money(lastPayment.amount)} บาท)` : "ยังไม่มีการชำระ",
                    },
                    {
                      label: "ยอดค้างชำระ",
                      value: (
                        <span className={current.outstanding > 0 ? "text-bad" : "text-ok"}>
                          {current.outstanding > 0 ? `${money(current.outstanding)} บาท` : "ไม่มียอดค้าง"}
                        </span>
                      ),
                    },
                    { label: "เงินประกันคงเหลือ", value: `${money(current.deposit_balance)} บาท` },
                  ]}
                />

                <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
                  <Link href={`/invoices/new?contract=${current.id}`} className="btn btn-brand">
                    <FilePlus2 className="size-4" /> ออกใบวางบิล
                  </Link>
                  <Link href={`/contracts/${current.id}`} className="btn btn-outline">
                    <FileSignature className="size-4" /> ดูสัญญา
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<FileSignature className="size-6" />}
                title={unit.status === "available" ? "ห้องว่าง พร้อมให้เช่า" : "ห้องนี้ยังไม่พร้อมให้เช่า"}
                description={
                  unit.status === "available"
                    ? `ราคา ${baht(unit.effective_price)}/เดือน`
                    : unit.status === "maintenance"
                      ? "ห้องอยู่ระหว่างปิดปรับปรุง แก้ไขสถานะห้องเพื่อเปิดให้เช่า"
                      : "ห้องนี้ถูกปิดใช้งาน"
                }
                action={
                  unit.status === "available" && (
                    <Link href={`/contracts/new?unit=${unit.id}`} className="btn btn-primary">
                      <FileSignature className="size-4" /> ทำสัญญาเช่าห้องนี้
                    </Link>
                  )
                }
              />
            </Card>
          )}

          <Card>
            <CardHeader title="ประวัติการเช่า" description={`${contracts.length} สัญญา`} />
            {contracts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่เคยมีสัญญาเช่า</p>
            ) : (
              <ul className="divide-y divide-line">
                {contracts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contracts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.tenant_name}</div>
                        <div className="text-xs text-muted">
                          {c.contract_no} · {thDate(c.start_date)} – {thDate(c.ended_on ?? c.end_date)}
                        </div>
                      </div>
                      <ContractStatusBadge status={c.status} expiring={c.is_expiring} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="ข้อมูลห้อง" />
            <div className="p-4 sm:p-5">
              <DefinitionList
                items={[
                  { label: "รหัส", value: unit.code },
                  { label: "ประเภท", value: unit.unit_type_name },
                  {
                    label: "ราคาตั้งต้น",
                    value: (
                      <>
                        {baht(unit.effective_price)}/เดือน
                        {unit.monthly_price !== null && <span className="block text-xs text-muted">ราคาเฉพาะห้อง</span>}
                      </>
                    ),
                  },
                  { label: "สาขา", value: <Link href={`/units?branch=${unit.branch_id}`} className="underline">{unit.branch_name}</Link> },
                  ...(unit.note ? [{ label: "หมายเหตุ", value: unit.note, full: true }] : []),
                ]}
              />
            </div>
          </Card>
          {current && current.outstanding > 0 && (
            <Alert tone="bad">
              <ReceiptText className="mr-1 inline size-4" />
              มียอดค้างชำระ {money(current.outstanding)} บาท{" "}
              <Link href={`/contracts/${current.id}`} className="font-semibold underline">
                ดูใบวางบิล
              </Link>
            </Alert>
          )}
          {owner && contracts.length === 0 && (
            <div className="flex justify-end">
              <DeleteUnitButton unit={unit} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
