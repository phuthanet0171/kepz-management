import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  DoorOpen,
  FilePlus2,
  ReceiptText,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, EmptyState, StatCard } from "@/components/ui";
import { isOwner } from "@/lib/auth";
import { fetchAll, getBranches } from "@/lib/data";
import { addMonths, baht, daysBetween, money, thDate, thMonth, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, ContractView, InvoiceView, UnitView } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const owner = await isOwner();
  const today = todayTH();
  const thisMonth = today.slice(0, 7);
  const sixMonthsAgo = addMonths(`${thisMonth}-01`, -5);

  const [branches, units, unpaid, expiring, due, payments] = await Promise.all([
    getBranches(),
    fetchAll<Pick<UnitView, "branch_id" | "status" | "is_expiring">>((from, to) =>
      supabase.from("v_units").select("branch_id, status, is_expiring").neq("status", "inactive").order("id").range(from, to),
    ),
    fetchAll<InvoiceView>((from, to) =>
      supabase.from("v_invoices").select("*").in("status", ["unpaid", "partial"]).order("due_date").order("id").range(from, to),
    ),
    fetchAll<ContractView>((from, to) =>
      supabase.from("v_contracts").select("*").eq("status", "active").eq("is_expiring", true).order("end_date").range(from, to),
    ),
    fetchAll<BillingDue>((from, to) =>
      supabase.from("v_billing_due").select("*").eq("is_due", true).order("period_start").order("contract_id").range(from, to),
    ),
    owner
      ? fetchAll<{ paid_on: string; amount: number }>((from, to) =>
          supabase.from("payments").select("paid_on, amount").eq("is_void", false).gte("paid_on", sixMonthsAgo).order("id").range(from, to),
        )
      : Promise.resolve([]),
  ]);

  if (branches.length === 0) {
    return (
      <>
        <Greeting today={today} />
        <Card>
          <EmptyState
            icon={<Warehouse className="size-6" />}
            title="ยินดีต้อนรับสู่ Kepz Management"
            description={
              owner
                ? "เริ่มต้นด้วยการเพิ่มสาขาและระบุจำนวนห้องแต่ละไซส์กับที่จอดรถ จากนั้นตั้งค่าข้อมูลกิจการสำหรับออกเอกสาร"
                : "ยังไม่มีสาขาในระบบ กรุณาติดต่อเจ้าของกิจการ"
            }
            action={
              owner &&
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/branches/new" className="btn btn-primary">
                  เพิ่มสาขาแรก
                </Link>
                <Link href="/settings" className="btn btn-outline">
                  ตั้งค่ากิจการ
                </Link>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  // รายได้รายเดือน (ตามวันที่รับชำระ)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${thisMonth}-01`, i - 5).slice(0, 7));
  const revenue = new Map(months.map((m) => [m, 0]));
  for (const p of payments) {
    const m = p.paid_on.slice(0, 7);
    if (revenue.has(m)) revenue.set(m, revenue.get(m)! + Number(p.amount));
  }
  const revThis = revenue.get(thisMonth) ?? 0;
  const revLast = revenue.get(months[4]) ?? 0;
  const change = revLast > 0 ? ((revThis - revLast) / revLast) * 100 : null;
  const maxRev = Math.max(1, ...revenue.values());

  const occupied = units.filter((u) => u.status === "occupied").length;
  const available = units.filter((u) => u.status === "available").length;
  const occRate = units.length ? Math.round((occupied / units.length) * 100) : 0;
  const outstanding = unpaid.reduce((a, i) => a + Number(i.outstanding), 0);
  const overdue = unpaid.filter((i) => i.is_overdue);

  const branchStats = branches
    .filter((b) => b.is_active)
    .map((b) => {
      const us = units.filter((u) => u.branch_id === b.id);
      const occ = us.filter((u) => u.status === "occupied").length;
      return { ...b, total: us.length, occ, rate: us.length ? Math.round((occ / us.length) * 100) : 0 };
    });

  return (
    <>
      <Greeting today={today} />

      {owner && (
      <Card className="mb-3 overflow-hidden border-ink bg-ink text-white">
        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_1.2fr] sm:p-6">
          <div>
            <div className="text-sm text-white/60">รายรับเดือน {thMonth(thisMonth)}</div>
            <div className="tabular mt-1 text-4xl font-bold tracking-tight">{baht(revThis)}</div>
            {change !== null && (
              <div
                className={clsx(
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  change >= 0 ? "bg-ok/25 text-green-300" : "bg-bad/25 text-red-300",
                )}
              >
                {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)}% จากเดือนก่อน
              </div>
            )}
          </div>
          <div className="flex h-28 items-end gap-2" aria-label="รายรับย้อนหลัง 6 เดือน">
            {months.map((m) => {
              const v = revenue.get(m) ?? 0;
              return (
                <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      title={`${thMonth(m)}: ${money(v)} บาท`}
                      className={clsx("w-full rounded-t-md", m === thisMonth ? "bg-brand" : "bg-white/20")}
                      style={{ height: `${Math.max(4, (v / maxRev) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/50">{thMonth(m)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="อัตราการเช่า"
          value={`${occRate}%`}
          hint={`มีผู้เช่า ${occupied} / ${units.length}`}
          icon={<Warehouse className="size-4" />}
          href="/units"
        />
        <StatCard
          label="ห้องว่าง"
          value={available}
          hint="พร้อมให้เช่า"
          icon={<DoorOpen className="size-4" />}
          tone="ok"
          href="/units?status=available"
        />
        <StatCard
          label="รอชำระ"
          value={baht(outstanding)}
          hint={`${unpaid.length} ใบ · เกินกำหนด ${overdue.length}`}
          icon={<ReceiptText className="size-4" />}
          tone={overdue.length ? "bad" : "warn"}
          href="/invoices?tab=unpaid"
        />
        <StatCard
          label="สัญญาใกล้หมด"
          value={expiring.length}
          hint="ภายในเวลาที่ตั้งไว้"
          icon={<CalendarClock className="size-4" />}
          tone={expiring.length ? "warn" : "neutral"}
          href="/contracts?tab=expiring"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FilePlus2 className="size-4" /> ถึงรอบออกบิล
              </span>
            }
            action={
              due.length > 0 && (
                <Link href="/invoices?tab=due" className="btn btn-outline btn-sm">
                  ดูทั้งหมด {due.length}
                </Link>
              )
            }
          />
          <List
            empty="ไม่มีสัญญาที่ถึงรอบออกบิล"
            rows={due.slice(0, 5).map((d) => ({
              key: d.contract_id,
              href: `/invoices/new?contract=${d.contract_id}`,
              title: `${d.unit_code} · ${d.tenant_name}`,
              sub: `รอบ ${thDate(d.period_start)} – ${thDate(d.period_end)}`,
              right: money(Number(d.monthly_rent) * d.months),
              tone: d.period_start < today ? "bad" : undefined,
            }))}
          />
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" /> ค้างชำระเกินกำหนด
              </span>
            }
            action={
              overdue.length > 0 && (
                <Link href="/invoices?tab=unpaid" className="btn btn-outline btn-sm">
                  ดูทั้งหมด {overdue.length}
                </Link>
              )
            }
          />
          <List
            empty="ไม่มียอดค้างเกินกำหนด"
            rows={overdue
              .sort((a, b) => b.days_overdue - a.days_overdue)
              .slice(0, 5)
              .map((i) => ({
                key: i.id,
                href: `/invoices/${i.id}`,
                title: `${i.unit_code} · ${i.tenant_name}`,
                sub: `${i.invoice_no} · เกินกำหนด ${i.days_overdue} วัน`,
                right: money(i.outstanding),
                tone: "bad" as const,
              }))}
          />
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="size-4" /> สัญญาใกล้หมด
              </span>
            }
            action={
              expiring.length > 0 && (
                <Link href="/contracts?tab=expiring" className="btn btn-outline btn-sm">
                  ดูทั้งหมด {expiring.length}
                </Link>
              )
            }
          />
          <List
            empty="ไม่มีสัญญาใกล้หมด"
            rows={expiring.slice(0, 5).map((c) => {
              const d = daysBetween(today, c.end_date);
              return {
                key: c.id,
                href: `/contracts/${c.id}`,
                title: `${c.unit_code} · ${c.tenant_name}`,
                sub: `สิ้นสุด ${thDate(c.end_date)}`,
                right: d >= 0 ? `อีก ${d} วัน` : `เลย ${-d} วัน`,
                tone: d < 0 ? "bad" : "warn",
              };
            })}
          />
        </Card>

        <Card>
          <CardHeader title="อัตราการเช่าแต่ละสาขา" />
          <ul className="space-y-4 p-4 sm:p-5">
            {branchStats.map((b) => (
              <li key={b.id}>
                <Link href={`/units?branch=${b.id}`} className="block">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className="tabular text-muted">
                      {b.occ}/{b.total} · <b className="text-ink">{b.rate}%</b>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${b.rate}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Greeting({ today }: { today: string }) {
  return (
    <header className="mb-5">
      <p className="text-sm text-muted">{thDate(today)}</p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">ภาพรวมธุรกิจ</h1>
    </header>
  );
}

function List({
  rows,
  empty,
}: {
  rows: { key: string; href: string; title: string; sub: string; right: string; tone?: "bad" | "warn" }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas/50 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="truncate text-xs text-muted">{r.sub}</div>
            </div>
            <span
              className={clsx(
                "tabular shrink-0 text-sm font-semibold",
                r.tone === "bad" && "text-bad",
                r.tone === "warn" && "text-warn",
              )}
            >
              {r.right}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
