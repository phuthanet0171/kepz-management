import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  FilePlus2,
  ReceiptText,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";
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

  const [branches, units, unpaid, expiring, due, payments, activeRents] = await Promise.all([
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
    owner
      ? fetchAll<{ monthly_rent: number }>((from, to) =>
          supabase.from("v_contracts").select("monthly_rent").eq("status", "active").order("id").range(from, to),
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
              owner && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/branches/new" className="btn btn-primary">
                    เพิ่มสาขาแรก
                  </Link>
                  <Link href="/settings?section=business" className="btn btn-outline">
                    ตั้งค่ากิจการ
                  </Link>
                </div>
              )
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
  // เทียบกับช่วงเดียวกันของเดือนก่อน (วันที่ 1 ถึงวันนี้) จะได้ไม่ดูว่าลดลงทุกต้นเดือน
  const lastMonth = months[4];
  const sameDayLast = `${lastMonth}-${today.slice(8, 10)}`;
  const revLastToDate = payments
    .filter((p) => p.paid_on.startsWith(lastMonth) && p.paid_on <= sameDayLast)
    .reduce((a, p) => a + Number(p.amount), 0);
  const change = revLastToDate > 0 ? ((revThis - revLastToDate) / revLastToDate) * 100 : null;
  const rev6 = [...revenue.values()].reduce((a, v) => a + v, 0);
  // เฉลี่ยเฉพาะเดือนตั้งแต่เริ่มมีรายรับ (เพิ่งเริ่มใช้ระบบจะไม่ถูกหารด้วยเดือนที่ยังไม่มีข้อมูล)
  const firstRev = months.findIndex((m) => (revenue.get(m) ?? 0) > 0);
  const revMonths = firstRev < 0 ? 1 : months.length - firstRev;
  const monthlyRent = activeRents.reduce((a, c) => a + Number(c.monthly_rent), 0);

  const mix = countMix(units);
  const occRate = mix.total ? Math.round((mix.occupied / mix.total) * 100) : 0;
  const outstanding = unpaid.reduce((a, i) => a + Number(i.outstanding), 0);
  const overdue = unpaid.filter((i) => i.is_overdue).sort((a, b) => b.days_overdue - a.days_overdue);
  const overdueSum = overdue.reduce((a, i) => a + Number(i.outstanding), 0);

  const branchStats = branches
    .filter((b) => b.is_active)
    .map((b) => {
      const m = countMix(units.filter((u) => u.branch_id === b.id));
      return { ...b, ...m, rate: m.total ? Math.round((m.occupied / m.total) * 100) : 0 };
    });

  return (
    <>
      <Greeting today={today} />

      {owner && (
        <section className="mb-3 overflow-hidden rounded-card bg-ink text-white" aria-label="รายรับ">
          <div className="grid gap-5 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-10">
            <div className="flex flex-col">
              <div className="text-sm text-white/60">รายรับเดือน {thMonth(thisMonth)}</div>
              <div className="tabular mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{baht(revThis)}</div>
              {change !== null && (
                <div
                  className={clsx(
                    "mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    change >= 0 ? "bg-ok/25 text-green-300" : "bg-bad/25 text-red-300",
                  )}
                >
                  {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(0)}% จากช่วงเดียวกันเดือนก่อน
                </div>
              )}
              <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-white/10 pt-4 max-lg:mt-5">
                <div>
                  <dt className="text-xs text-white/50">ค่าเช่าประจำต่อเดือน</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold">{baht(monthlyRent)}</dd>
                  <dd className="text-xs text-white/50">จาก {activeRents.length} สัญญาที่ใช้งาน</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/50">{revMonths < 6 ? `รวม ${revMonths} เดือนที่มีข้อมูล` : "รวม 6 เดือนล่าสุด"}</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold">{baht(rev6)}</dd>
                  <dd className="text-xs text-white/50">เฉลี่ย {baht(rev6 / revMonths)} / เดือน</dd>
                </div>
              </dl>
            </div>
            <RevenueChart months={months} revenue={revenue} current={thisMonth} />
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="อัตราการเช่า" icon={<Warehouse className="size-4" />} href="/units" value={`${occRate}%`}>
          <MixBar mix={mix} className="mt-2.5" />
          <p className="mt-1.5 text-xs text-muted">
            มีผู้เช่า {mix.occupied} จาก {mix.total} ห้อง
          </p>
        </Kpi>
        <Kpi label="ห้องว่าง" icon={<DoorOpen className="size-4" />} tone="ok" href="/units" value={mix.available}>
          <p className="mt-1 text-xs text-muted">
            พร้อมให้เช่า{mix.maintenance > 0 && ` · ปิดปรับปรุง ${mix.maintenance}`}
          </p>
        </Kpi>
        <Kpi
          label="ยอดรอรับชำระ"
          icon={<ReceiptText className="size-4" />}
          tone={overdue.length ? "bad" : unpaid.length ? "warn" : "neutral"}
          href="/invoices?tab=unpaid"
          value={baht(outstanding)}
        >
          <p className="mt-1 text-xs text-muted">{unpaid.length} ใบที่ยังไม่ได้รับเงิน</p>
          {overdue.length > 0 && (
            <p className="mt-0.5 text-xs font-semibold text-bad">เกินกำหนด {baht(overdueSum)}</p>
          )}
        </Kpi>
        <Kpi
          label="สัญญาใกล้หมด"
          icon={<CalendarClock className="size-4" />}
          tone={expiring.length ? "warn" : "neutral"}
          href="/contracts?tab=expiring"
          value={expiring.length}
        >
          <p className="mt-1 text-xs text-muted">{expiring.length ? "ควรติดต่อต่อสัญญา" : "ภายในเวลาที่ตั้งไว้"}</p>
        </Kpi>
      </div>

      <h2 className="mb-3 text-lg font-bold tracking-tight">งานที่ต้องจัดการ</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <TaskCard
          title="ค้างชำระเกินกำหนด"
          icon={<AlertTriangle className="size-4" />}
          tone="bad"
          count={overdue.length}
          href="/invoices?tab=unpaid"
          empty="ไม่มียอดค้างเกินกำหนด"
          rows={overdue.slice(0, 5).map((i) => ({
            key: i.id,
            href: `/invoices/${i.id}`,
            code: i.unit_code,
            title: i.tenant_name,
            sub: i.invoice_no,
            amount: money(i.outstanding),
            pill: `เกิน ${i.days_overdue} วัน`,
            tone: "bad",
          }))}
        />
        <TaskCard
          title="ถึงรอบออกบิล"
          icon={<FilePlus2 className="size-4" />}
          tone="brand"
          count={due.length}
          href="/invoices?tab=due"
          empty="ไม่มีสัญญาที่ถึงรอบออกบิล"
          rows={due.slice(0, 5).map((d) => ({
            key: d.contract_id,
            href: `/invoices/new?contract=${d.contract_id}`,
            code: d.unit_code,
            title: d.tenant_name,
            sub: `รอบ ${periodText(d.period_start, d.period_end)}`,
            amount: money(Number(d.monthly_rent) * d.months),
            pill: "ออกบิล",
            tone: "brand",
          }))}
        />
        <TaskCard
          title="สัญญาใกล้หมด"
          icon={<CalendarClock className="size-4" />}
          tone="warn"
          count={expiring.length}
          href="/contracts?tab=expiring"
          empty="ไม่มีสัญญาใกล้หมด"
          rows={expiring.slice(0, 5).map((c) => {
            const d = daysBetween(today, c.end_date);
            return {
              key: c.id,
              href: `/contracts/${c.id}`,
              code: c.unit_code,
              title: c.tenant_name,
              sub: `สิ้นสุด ${thDate(c.end_date)}`,
              pill: d >= 0 ? `อีก ${d} วัน` : `หมดแล้ว ${-d} วัน`,
              tone: d < 0 ? "bad" : "warn",
            };
          })}
        />
      </div>

      {branchStats.length > 1 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 sm:px-5">
            <h2 className="font-semibold">อัตราการเช่าแต่ละสาขา</h2>
            <MixLegend />
          </div>
          <ul className="grid gap-x-8 gap-y-5 p-4 sm:p-5 md:grid-cols-2">
            {branchStats.map((b) => (
              <li key={b.id}>
                <Link href={`/units?branch=${b.id}`} className="group block">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium group-hover:underline">{b.name}</span>
                    <span className="tabular shrink-0 text-muted">
                      {b.occupied}/{b.total} · <b className="text-ink">{b.rate}%</b>
                    </span>
                  </div>
                  <MixBar mix={b} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

type Mix = { total: number; occupied: number; available: number; maintenance: number };

function countMix(units: Pick<UnitView, "status">[]): Mix {
  const m = { total: units.length, occupied: 0, available: 0, maintenance: 0 };
  for (const u of units) {
    if (u.status === "occupied") m.occupied++;
    else if (u.status === "available") m.available++;
    else if (u.status === "maintenance") m.maintenance++;
  }
  return m;
}

/** แถบสัดส่วนห้อง: มีผู้เช่า (ดำ) · ว่าง (เขียว) · ปิดปรับปรุง (เทา) สีเดียวกับผังสถานที่ */
function MixBar({ mix, className }: { mix: Mix; className?: string }) {
  const seg = (n: number) => (mix.total ? `${(n / mix.total) * 100}%` : "0%");
  return (
    <div
      className={clsx("flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-line", className)}
      role="img"
      aria-label={`มีผู้เช่า ${mix.occupied} ว่าง ${mix.available} ปิดปรับปรุง ${mix.maintenance}`}
    >
      {mix.occupied > 0 && <span className="bg-ink" style={{ width: seg(mix.occupied) }} />}
      {mix.available > 0 && <span className="bg-ok/70" style={{ width: seg(mix.available) }} />}
      {mix.maintenance > 0 && <span className="bg-muted/40" style={{ width: seg(mix.maintenance) }} />}
    </div>
  );
}

function MixLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {(
        [
          ["bg-ink", "มีผู้เช่า"],
          ["bg-ok/70", "ว่าง"],
          ["bg-muted/40", "ปิดปรับปรุง"],
        ] as const
      ).map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-2.5 rounded-full", c)} /> {l}
        </span>
      ))}
    </div>
  );
}

/** รอบบิลแบบสั้น: 1 ธ.ค. – 31 ธ.ค. 2569 (ปีเดียวกันแสดงปีครั้งเดียว) */
function periodText(start: string, end: string) {
  const a = thDate(start);
  return `${start.slice(0, 4) === end.slice(0, 4) ? a.replace(/\s\d{4}$/, "") : a} – ${thDate(end)}`;
}

/** ตัวเลขย่อบนกราฟ เช่น 2,700 → 2.7k */
function short(n: number) {
  if (n < 1000) return Math.round(n).toLocaleString("th-TH");
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : +k.toFixed(1)}k`;
}

function RevenueChart({ months, revenue, current }: { months: string[]; revenue: Map<string, number>; current: string }) {
  const max = Math.max(1, ...revenue.values());
  return (
    <div className="grid h-28 grid-cols-6 gap-2 sm:h-44 sm:gap-3" role="img" aria-label="รายรับย้อนหลัง 6 เดือน">
      {months.map((m) => {
        const v = revenue.get(m) ?? 0;
        const pct = v > 0 ? Math.max(6, (v / max) * 82) : 0;
        const cur = m === current;
        return (
          <div key={m} className="flex min-w-0 flex-col items-center gap-2" title={`${thMonth(m)}: ${money(v)} บาท`}>
            <div className="relative w-full flex-1">
              <span
                className={clsx(
                  "tabular absolute inset-x-0 text-center text-[11px] font-semibold",
                  cur ? "text-brand" : "text-white/60",
                )}
                style={{ bottom: `calc(${pct}% + 4px)` }}
              >
                {v > 0 ? short(v) : "–"}
              </span>
              <div
                className={clsx("absolute inset-x-0 bottom-0 rounded-t-md sm:inset-x-1", cur ? "bg-brand" : "bg-white/20")}
                style={{ height: pct ? `${pct}%` : "2px" }}
              />
            </div>
            <span className={clsx("text-[11px] whitespace-nowrap", cur ? "font-semibold text-white" : "text-white/50")}>
              {thMonth(m)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "brand";

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand text-ink",
};

function Kpi({
  label,
  icon,
  tone = "neutral",
  href,
  value,
  children,
}: {
  label: string;
  icon: ReactNode;
  tone?: Tone;
  href: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className="card group flex flex-col p-4 transition hover:border-ink/25 hover:shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
        <span className={clsx("grid size-8 shrink-0 place-items-center rounded-lg", ICON_TONE[tone])}>{icon}</span>
      </div>
      <div className="tabular mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</div>
      {children}
    </Link>
  );
}

type TaskRow = {
  key: string;
  href: string;
  code: string;
  title: string;
  sub: string;
  amount?: string;
  pill: string;
  tone: "bad" | "warn" | "brand";
};

const PILL_TONE: Record<TaskRow["tone"], string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  brand: "bg-brand text-ink",
};

function TaskCard({
  title,
  icon,
  tone,
  count,
  href,
  empty,
  rows,
}: {
  title: string;
  icon: ReactNode;
  tone: Tone;
  count: number;
  href: string;
  empty: string;
  rows: TaskRow[];
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl", count ? ICON_TONE[tone] : ICON_TONE.neutral)}>
          {icon}
        </span>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{title}</h3>
        {count > 0 && (
          <Link href={href} className="btn btn-outline btn-sm shrink-0">
            ดูทั้งหมด {count}
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center gap-2 px-5 py-8 text-sm text-muted">
          <CheckCircle2 className="size-4 text-ok" /> {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas/60 sm:px-5">
                <span className="grid h-10 w-[4.75rem] shrink-0 place-items-center rounded-xl bg-canvas px-1.5 text-xs font-bold">
                  <span className="truncate">{r.code}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="truncate text-xs text-muted">{r.sub}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.amount && (
                    <span className={clsx("tabular text-sm font-semibold", r.tone === "bad" && "text-bad")}>{r.amount}</span>
                  )}
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", PILL_TONE[r.tone])}>
                    {r.pill}
                  </span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
