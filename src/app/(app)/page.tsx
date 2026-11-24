import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
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
      ? fetchAll<Pay>((from, to) =>
          supabase
            .from("payments")
            .select("id, invoice_id, paid_on, amount, created_at")
            .eq("is_void", false)
            .gte("paid_on", sixMonthsAgo)
            .order("id")
            .range(from, to),
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

  // รายได้รายเดือน (ตามวันที่รับชำระ) แยกส่วนที่เป็นเงินประกันออก (เงินประกันต้องคืนผู้เช่า ไม่ใช่รายได้)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${thisMonth}-01`, i - 5).slice(0, 7));
  const depShare = owner ? await depositShares(supabase, payments) : new Map<string, number>();
  const revenue = new Map(months.map((m) => [m, 0])); // ไม่รวมเงินประกัน
  let depThis = 0;
  for (const p of payments) {
    const m = p.paid_on.slice(0, 7);
    if (!revenue.has(m)) continue;
    const dep = depShare.get(p.id) ?? 0;
    revenue.set(m, revenue.get(m)! + Number(p.amount) - dep);
    if (m === thisMonth) depThis += dep;
  }
  const rentThis = revenue.get(thisMonth) ?? 0;
  // เทียบ (ไม่รวมเงินประกัน) กับช่วงเดียวกันของเดือนก่อน (วันที่ 1 ถึงวันนี้) จะได้ไม่ดูว่าลดลงทุกต้นเดือน
  const lastMonth = months[4];
  const sameDayLast = `${lastMonth}-${today.slice(8, 10)}`;
  const revLastToDate = payments
    .filter((p) => p.paid_on.startsWith(lastMonth) && p.paid_on <= sameDayLast)
    .reduce((a, p) => a + Number(p.amount) - (depShare.get(p.id) ?? 0), 0);
  const change = revLastToDate > 0 ? ((rentThis - revLastToDate) / revLastToDate) * 100 : null;

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

  // งานที่ต้องจัดการ เรียงตามความเร่ง: งานที่มีรายการแสดงเป็นกรอบ งานที่ไม่มีย่อเป็นป้าย "✓ ไม่มี…"
  const tasks: TaskProps[] = [
    {
      title: "ค้างชำระเกินกำหนด",
      icon: <AlertTriangle className="size-4" />,
      tone: "bad",
      count: overdue.length,
      href: "/invoices?tab=unpaid",
      empty: "ไม่มียอดค้างเกินกำหนด",
      rows: overdue.slice(0, 5).map((i) => ({
        key: i.id,
        href: `/invoices/${i.id}`,
        code: i.unit_code,
        title: i.tenant_name,
        sub: i.invoice_no,
        amount: money(i.outstanding),
        pill: `เกิน ${i.days_overdue} วัน`,
        tone: "bad",
      })),
    },
    {
      title: "ถึงรอบออกบิล",
      icon: <FilePlus2 className="size-4" />,
      tone: "brand",
      count: due.length,
      href: "/invoices?tab=due",
      empty: "ไม่มีบิลที่ต้องออก",
      rows: due.slice(0, 5).map((d) => ({
        key: d.contract_id,
        href: `/invoices/new?contract=${d.contract_id}`,
        code: d.unit_code,
        title: d.tenant_name,
        sub: `รอบ ${periodText(d.period_start, d.period_end)}`,
        amount: money(Number(d.monthly_rent) * d.months),
        pill: "ออกบิล",
        tone: "brand",
      })),
    },
    {
      title: "สัญญาใกล้หมด",
      icon: <CalendarClock className="size-4" />,
      tone: "warn",
      count: expiring.length,
      href: "/contracts?tab=expiring",
      empty: "ไม่มีสัญญาใกล้หมด",
      rows: expiring.slice(0, 5).map((c) => {
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
      }),
    },
  ];
  const openTasks = tasks.filter((t) => t.rows.length > 0);
  const doneTasks = tasks.filter((t) => t.rows.length === 0);

  return (
    <>
      <Greeting today={today} />

      {owner && (
        <section className="mb-3 overflow-hidden rounded-card bg-ink text-white" aria-label="รายรับ">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-end lg:gap-10">
            <div>
              <div className="text-sm text-white/60">รายรับเดือน {thMonth(thisMonth)}</div>
              <div className="tabular mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{baht(rentThis + depThis)}</div>
              {/* แยกที่มาของเงิน: ค่าเช่า (รายได้จริง) กับ เงินประกัน (ต้องคืนผู้เช่า) */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
                <div className="rounded-xl bg-brand px-3.5 py-2.5 text-ink">
                  <div className="text-xs font-medium text-ink/70">ค่าเช่า</div>
                  <div className="tabular text-xl font-bold">{baht(rentThis)}</div>
                  {change !== null && (
                    <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink/70">
                      {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                      {change >= 0 ? "+" : ""}
                      {change.toFixed(0)}% จากเดือนก่อน
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-white/10 px-3.5 py-2.5">
                  <div className="text-xs font-medium text-white/60">เงินประกัน</div>
                  <div className="tabular text-xl font-bold">{baht(depThis)}</div>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs text-white/40">ค่าเช่า 6 เดือนล่าสุด</div>
              <RevenueChart months={months} revenue={revenue} current={thisMonth} />
            </div>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label="อัตราการเช่า"
          icon={<Warehouse className="size-4" />}
          href="/units"
          value={`${occRate}%`}
          className="col-span-2 lg:col-span-1"
        >
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
          <p className="mt-1 text-xs text-muted">{unpaid.length ? `${unpaid.length} ใบที่ยังไม่ได้รับเงิน` : "ไม่มียอดค้าง"}</p>
          {overdue.length > 0 && (
            <p className="mt-0.5 text-xs font-semibold text-bad">เกินกำหนด {baht(overdueSum)}</p>
          )}
        </Kpi>
      </div>

      {branchStats.length > 1 && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-brand">
              <Building2 className="size-4" />
            </span>
            <h2 className="min-w-0 flex-1 truncate font-semibold">อัตราการเช่าแต่ละสาขา</h2>
            <MixLegend className="max-sm:hidden" />
          </div>
          <ul
            className={clsx(
              "grid gap-3 p-3 sm:grid-cols-2 sm:p-4",
              // 2 หรือ 4 สาขา = 2 คอลัมน์พอดี ไม่เหลือช่องว่าง
              branchStats.length !== 2 && branchStats.length !== 4 && "xl:grid-cols-3",
            )}
          >
            {branchStats.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/units?branch=${b.id}`}
                  className="group block rounded-xl border border-line p-3.5 transition hover:border-ink/25 hover:bg-canvas/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{b.name}</div>
                      <div className="tabular text-xs text-muted">
                        มีผู้เช่า {b.occupied}/{b.total} ห้อง{b.available > 0 && ` · ว่าง ${b.available}`}
                      </div>
                    </div>
                    <span className="tabular shrink-0 text-2xl leading-none font-bold">
                      {b.rate}
                      <span className="text-sm font-semibold text-muted">%</span>
                    </span>
                  </div>
                  <MixBar mix={b} className="mt-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-bold tracking-tight">งานที่ต้องจัดการ</h2>
      {doneTasks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {doneTasks.map((t) => (
            <span
              key={t.title}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2"
            >
              <CheckCircle2 className="size-4 text-ok" /> {t.empty}
            </span>
          ))}
        </div>
      )}
      {openTasks.length > 0 && (
        <div className={clsx("grid grid-cols-1 gap-4", openTasks.length > 1 && "lg:grid-cols-2")}>
          {openTasks.map((t, i) => (
            <TaskCard
              key={t.title}
              {...t}
              // งานคี่ใบสุดท้ายกว้างเต็มแถว ไม่ให้เหลือช่องว่างข้างๆ
              className={openTasks.length % 2 === 1 && i === openTasks.length - 1 && openTasks.length > 1 ? "lg:col-span-2" : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}

type Pay = { id: string; invoice_id: string; paid_on: string; amount: number; created_at: string };

function chunks<T>(xs: T[], n = 150) {
  return Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
}

/**
 * ส่วนที่เป็นเงินประกันของแต่ละใบเสร็จ: บิลที่มีเงินประกัน ยอดที่ชำระนับเป็นเงินประกันก่อน
 * (ตรงกับที่ฐานข้อมูลบันทึกรับเงินประกัน) ไล่ตามลำดับการชำระทั้งหมดของบิลนั้น
 */
async function depositShares(supabase: Awaited<ReturnType<typeof createClient>>, pays: Pay[]) {
  const share = new Map<string, number>();
  const invIds = [...new Set(pays.map((p) => p.invoice_id))];
  const depByInv = new Map<string, number>();
  for (const ids of chunks(invIds)) {
    const items = await fetchAll<{ invoice_id: string; amount: number }>((from, to) =>
      supabase
        .from("invoice_items")
        .select("invoice_id, amount")
        .eq("item_type", "deposit")
        .in("invoice_id", ids)
        .order("id")
        .range(from, to),
    );
    for (const it of items) depByInv.set(it.invoice_id, (depByInv.get(it.invoice_id) ?? 0) + Number(it.amount));
  }
  for (const ids of chunks([...depByInv.keys()])) {
    // ใบเสร็จทั้งหมดของบิลเหล่านี้ (รวมที่จ่ายก่อนช่วง 6 เดือน) เพื่อรู้ว่าเงินประกันถูกจ่ายไปแล้วเท่าไร
    const all = await fetchAll<Pay>((from, to) =>
      supabase
        .from("payments")
        .select("id, invoice_id, paid_on, amount, created_at")
        .eq("is_void", false)
        .in("invoice_id", ids)
        .order("id")
        .range(from, to),
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

function MixLegend({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted", className)}>
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

/** กราฟรายรับ 6 เดือน (ไม่รวมเงินประกัน) */
function RevenueChart({ months, revenue, current }: { months: string[]; revenue: Map<string, number>; current: string }) {
  const max = Math.max(1, ...revenue.values());
  return (
    <div className="grid h-24 grid-cols-6 gap-2 sm:h-32 sm:gap-3" role="img" aria-label="รายรับย้อนหลัง 6 เดือน">
      {months.map((m) => {
        const v = revenue.get(m) ?? 0;
        const pct = v > 0 ? Math.max(6, (v / max) * 78) : 0;
        const cur = m === current;
        return (
          <div key={m} className="flex min-w-0 flex-col items-center gap-1.5" title={`${thMonth(m)}: ${money(v)} บาท`}>
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
                className={clsx("absolute inset-x-0 bottom-0 rounded-t-md sm:inset-x-1", cur ? "bg-brand" : "bg-white/15")}
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
  className,
}: {
  label: string;
  icon: ReactNode;
  tone?: Tone;
  href: string;
  value: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx("card group flex flex-col p-4 transition hover:border-ink/25 hover:shadow-sm sm:p-5", className)}
    >
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

type TaskProps = {
  title: string;
  icon: ReactNode;
  tone: Tone;
  count: number;
  href: string;
  empty: string;
  rows: TaskRow[];
};

function TaskCard({ title, icon, tone, count, href, rows, className }: TaskProps & { className?: string }) {
  return (
    <Card className={clsx("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className={clsx("grid size-9 shrink-0 place-items-center rounded-xl", ICON_TONE[tone])}>{icon}</span>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{title}</h3>
        <Link href={href} className="btn btn-outline btn-sm shrink-0">
          ดูทั้งหมด {count}
        </Link>
      </div>
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
