import clsx from "clsx";
import {
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Hourglass,
  LayoutGrid,
  ReceiptText,
  Users,
  Warehouse,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SavePdfButton } from "@/components/save-pdf-button";
import { Card, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { fetchAll, getBranches } from "@/lib/data";
import { baht, money, thDate, thMonth, todayTH } from "@/lib/format";
import {
  AGING_BUCKETS,
  agingBucket,
  depositByInvoice,
  depositShares,
  getInvoicesInRange,
  getOutstanding,
  getPaymentsInRange,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { UnitView } from "@/lib/types";

export const metadata: Metadata = { title: "รายงาน" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayTH();
  const currentYear = Number(today.slice(0, 4));
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : currentYear;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;

  const [branches, payments, invoices, outstanding, units] = await Promise.all([
    getBranches(),
    getPaymentsInRange(from, to),
    getInvoicesInRange(from, to),
    getOutstanding(),
    fetchAll<Pick<UnitView, "branch_id" | "unit_type_code" | "unit_type_name" | "type_sort" | "status" | "effective_price" | "contract_rent">>(
      (a, b) =>
        supabase
          .from("v_units")
          .select("branch_id, unit_type_code, unit_type_name, type_sort, status, effective_price, contract_rent")
          .neq("status", "inactive")
          .order("id")
          .range(a, b),
    ),
  ]);

  const activePayments = payments.filter((p) => !p.is_void);
  const validInvoices = invoices.filter((i) => i.status !== "void");
  // แยกเงินประกันออกจากค่าเช่า: เงินประกันต้องคืนผู้เช่า ไม่ใช่รายได้
  const [depShare, invDeposit] = await Promise.all([
    depositShares(activePayments),
    depositByInvoice(validInvoices.map((i) => i.id)),
  ]);
  const dep = (p: { id: string }) => depShare.get(p.id) ?? 0;

  // ปีปัจจุบันแสดงถึงเดือนนี้ ปีที่ผ่านมาแสดงครบ 12 เดือน
  const lastMonth = year === currentYear ? Number(today.slice(5, 7)) : 12;
  const months = Array.from({ length: lastMonth }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const monthly = months.map((m) => {
    const ps = activePayments.filter((p) => p.paid_on.startsWith(m));
    const inv = validInvoices.filter((i) => i.issue_date.startsWith(m));
    const received = ps.reduce((a, p) => a + Number(p.amount), 0);
    const deposit = ps.reduce((a, p) => a + dep(p), 0);
    return {
      month: m,
      invoiced: inv.reduce((a, i) => a + Number(i.total), 0),
      vat: inv.reduce((a, i) => a + Number(i.vat_amount), 0),
      transfer: ps.filter((p) => p.method === "transfer").reduce((a, p) => a + Number(p.amount), 0),
      card: ps.filter((p) => p.method === "credit_card").reduce((a, p) => a + Number(p.amount), 0),
      received,
      deposit,
      rent: received - deposit,
    };
  });
  // ตารางไม่แสดงเดือนก่อนเริ่มมีรายการ (ช่วงที่ยังไม่ได้ใช้ระบบ) ให้ดูไม่รก
  const firstActive = monthly.findIndex((m) => m.received > 0 || m.invoiced > 0);
  const tableMonths = firstActive < 0 ? [] : monthly.slice(firstActive);
  type Key = "invoiced" | "vat" | "transfer" | "card" | "received" | "deposit" | "rent";
  const sum = (k: Key) => monthly.reduce((a, m) => a + m[k], 0);
  const invoicedDeposit = validInvoices.reduce((a, i) => a + (invDeposit.get(i.id) ?? 0), 0);

  const byBranch = branches.map((b) => {
    const ps = activePayments.filter((p) => p.invoices.contracts.units.branch_id === b.id);
    const received = ps.reduce((a, p) => a + Number(p.amount), 0);
    const deposit = ps.reduce((a, p) => a + dep(p), 0);
    return {
      id: b.id,
      name: b.name,
      rent: received - deposit,
      deposit,
      outstanding: outstanding.filter((i) => i.branch_id === b.id).reduce((a, i) => a + Number(i.outstanding), 0),
    };
  });

  const aging = AGING_BUCKETS.map((label) => {
    const rows = outstanding.filter((i) => agingBucket(i) === label);
    return { label, count: rows.length, amount: rows.reduce((a, i) => a + Number(i.outstanding), 0) };
  });
  const outstandingTotal = aging.reduce((a, b) => a + b.amount, 0);
  const overdueTotal = aging.slice(1).reduce((a, b) => a + b.amount, 0);

  const typeMap = new Map<string, { name: string; sort: number; total: number; occ: number; rent: number; potential: number }>();
  for (const u of units) {
    const t = typeMap.get(u.unit_type_code) ?? { name: u.unit_type_name, sort: u.type_sort, total: 0, occ: 0, rent: 0, potential: 0 };
    t.total++;
    t.potential += Number(u.effective_price);
    if (u.status === "occupied") {
      t.occ++;
      t.rent += Number(u.contract_rent ?? 0);
    }
    typeMap.set(u.unit_type_code, t);
  }
  const types = [...typeMap.values()].sort((a, b) => a.sort - b.sort);
  const rentNow = types.reduce((a, t) => a + t.rent, 0);
  const potentialNow = types.reduce((a, t) => a + t.potential, 0);
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
  const maxRent = Math.max(1, ...monthly.map((m) => m.received));
  const be = year + 543;

  return (
    <div className="print-report">
      <PageHeader
        title="รายงาน"
        actions={<SavePdfButton fileName={`รายงาน Kepz ปี ${be}`} className="btn btn-primary no-print" />}
      />
      <p className="mb-4 hidden text-sm text-muted print:block">
        ปี พ.ศ. {be} · พิมพ์เมื่อ {thDate(today)}
      </p>

      {/* เลือกปี: แตะแล้วเปลี่ยนทันที ไม่ต้องกดปุ่มแสดง */}
      <div className="no-print no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {years.map((y) => (
          <Link
            key={y}
            href={y === currentYear ? "/reports" : `/reports?year=${y}`}
            className={clsx(
              "rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition",
              y === year ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30",
            )}
          >
            พ.ศ. {y + 543}
          </Link>
        ))}
      </div>

      {/* รายรับทั้งปี แยก ค่าเช่า / เงินประกัน */}
      <section className="mb-3 overflow-hidden rounded-card bg-ink text-white" aria-label="รายรับทั้งปี">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-end lg:gap-10">
          <div>
            <div className="text-sm text-white/60">รายรับปี {be}</div>
            <div className="tabular mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{baht(sum("received"))}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
              <div className="rounded-xl bg-brand px-3.5 py-2.5 text-ink">
                <div className="text-xs font-medium text-ink/70">ค่าเช่า</div>
                <div className="tabular text-xl font-bold">{baht(sum("rent"))}</div>
              </div>
              <div className="rounded-xl bg-white/10 px-3.5 py-2.5">
                <div className="text-xs font-medium text-white/60">เงินประกัน</div>
                <div className="tabular text-xl font-bold">{baht(sum("deposit"))}</div>
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/40">
              <span>รายรับรายเดือน</span>
              <span className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-brand" /> ค่าเช่า
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-white/30" /> เงินประกัน
                </span>
              </span>
            </div>
            <div
              className="grid h-28 gap-1 sm:h-36 sm:gap-1.5"
              style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
              role="img"
              aria-label="รายรับรายเดือน"
            >
              {monthly.map((m) => {
                const h = m.received > 0 ? Math.max(5, (m.received / maxRent) * 100) : 0;
                return (
                  <div key={m.month} className="flex min-w-0 flex-col items-center gap-1.5" title={`${thMonth(m.month)}: ${money(m.received)} บาท`}>
                    <div className="relative w-full flex-1">
                      {h ? (
                        <div
                          className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t sm:inset-x-0.5"
                          style={{ height: `${h}%` }}
                        >
                          {/* บน = เงินประกัน (เทา) · ล่าง = ค่าเช่า (เหลือง) */}
                          <span className="bg-white/30" style={{ flexGrow: m.deposit }} />
                          <span className="bg-brand" style={{ flexGrow: m.rent }} />
                        </div>
                      ) : (
                        <div className="absolute inset-x-0 bottom-0 h-0.5 rounded bg-white/15 sm:inset-x-0.5" />
                      )}
                    </div>
                    <span className="text-[10px] text-white/50">{thMonth(m.month).split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="ออกใบวางบิลทั้งปี" value={baht(sum("invoiced"))} icon={<FileText className="size-4" />}>
          {invoicedDeposit > 0 && `รวมเงินประกัน ${baht(invoicedDeposit)}`}
        </Stat>
        <Stat
          label="ค้างชำระตอนนี้"
          value={baht(outstandingTotal)}
          icon={<Hourglass className="size-4" />}
          tone={overdueTotal > 0 ? "bad" : undefined}
        >
          {overdueTotal > 0 ? <span className="font-semibold text-bad">เกินกำหนด {baht(overdueTotal)}</span> : "ไม่มียอดเกินกำหนด"}
        </Stat>
        <Stat
          label="ภาษีขาย (VAT) ทั้งปี"
          value={baht(sum("vat"))}
          icon={<ReceiptText className="size-4" />}
          className="max-lg:col-span-2"
        >
          จากใบวางบิลที่ออกในปีนี้
        </Stat>
      </div>

      {/* รายเดือน */}
      <Section
        icon={<LayoutGrid className="size-4" />}
        title="รายรับรายเดือน"
        action={<CsvLink href={`/api/export/payments?year=${year}`} />}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="text-right">ค่าเช่า</th>
                <th className="text-right">เงินประกัน</th>
                <th className="text-right">รับชำระรวม</th>
                <th className="text-right max-md:hidden print-show">โอน/พร้อมเพย์</th>
                <th className="text-right max-md:hidden print-show">บัตรเครดิต</th>
                <th className="text-right max-md:hidden print-show">ออกบิล</th>
              </tr>
            </thead>
            <tbody>
              {tableMonths.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    ยังไม่มีรายรับในปี {be}
                  </td>
                </tr>
              )}
              {tableMonths.map((m) => (
                <tr key={m.month} className={clsx(m.received === 0 && m.invoiced === 0 && "text-muted/70")}>
                  <td className="whitespace-nowrap">{thMonth(m.month)}</td>
                  <td className="tabular text-right font-semibold">{money(m.rent)}</td>
                  <td className="tabular text-right">{money(m.deposit)}</td>
                  <td className="tabular text-right">{money(m.received)}</td>
                  <td className="tabular text-right text-muted max-md:hidden print-show">{money(m.transfer)}</td>
                  <td className="tabular text-right text-muted max-md:hidden print-show">{money(m.card)}</td>
                  <td className="tabular text-right text-muted max-md:hidden print-show">{money(m.invoiced)}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-bold">
                <td>รวม</td>
                <td className="tabular text-right">{money(sum("rent"))}</td>
                <td className="tabular text-right">{money(sum("deposit"))}</td>
                <td className="tabular text-right">{money(sum("received"))}</td>
                <td className="tabular text-right max-md:hidden print-show">{money(sum("transfer"))}</td>
                <td className="tabular text-right max-md:hidden print-show">{money(sum("card"))}</td>
                <td className="tabular text-right max-md:hidden print-show">{money(sum("invoiced"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* ค้างชำระตามอายุหนี้ */}
        <Section
          icon={<Hourglass className="size-4" />}
          title="ยอดค้างชำระตามอายุหนี้"
          action={<CsvLink href="/api/export/outstanding" />}
          className="mb-0"
        >
          <ul className="divide-y divide-line">
            {aging.map((a, i) => (
              <li key={a.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span
                  className={clsx(
                    "size-2.5 shrink-0 rounded-full",
                    i === 0 ? "bg-ok" : a.amount > 0 ? "bg-bad" : "bg-line",
                  )}
                />
                <span className="min-w-0 flex-1 text-sm">{a.label}</span>
                <span className="tabular text-xs text-muted">{a.count} ใบ</span>
                <span className={clsx("tabular w-24 text-right text-sm font-semibold", i > 0 && a.amount > 0 && "text-bad")}>
                  {money(a.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* แยกตามสาขา */}
        <Section icon={<Building2 className="size-4" />} title={`แยกตามสาขา (ปี ${be})`} className="mb-0">
          <ul className="divide-y divide-line">
            {byBranch.map((b) => (
              <li key={b.id}>
                <Link href={`/units?branch=${b.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.name}</div>
                    <div className="tabular text-xs text-muted">
                      ค่าเช่า {money(b.rent)} · เงินประกัน {money(b.deposit)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular text-sm font-semibold">{money(b.rent + b.deposit)}</div>
                    <div className={clsx("tabular text-xs", b.outstanding > 0 ? "font-semibold text-bad" : "text-muted")}>
                      {b.outstanding > 0 ? `ค้าง ${money(b.outstanding)}` : "ไม่มีค้าง"}
                    </div>
                  </div>
                  <ChevronRight className="no-print size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* ตามประเภทห้อง */}
      <Section
        icon={<Warehouse className="size-4" />}
        title="อัตราการเช่าตามประเภทห้อง (ตอนนี้)"
        action={<CsvLink href="/api/export/units" />}
      >
        <div className="border-b border-line px-4 py-3 text-sm sm:px-5">
          ค่าเช่าตามสัญญาตอนนี้ <b className="tabular">{baht(rentNow)}</b> / เดือน จากเต็มศักยภาพ{" "}
          <span className="tabular text-muted">{baht(potentialNow)}</span>
          <span className="tabular ml-1 font-semibold">({potentialNow ? Math.round((rentNow / potentialNow) * 100) : 0}%)</span>
        </div>
        <ul className="divide-y divide-line">
          {types.map((t) => {
            const rate = t.total ? Math.round((t.occ / t.total) * 100) : 0;
            return (
              <li key={t.name} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="tabular grid h-10 w-14 shrink-0 place-items-center rounded-xl bg-canvas text-sm font-bold">{rate}%</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{t.name}</span>
                    <span className="tabular shrink-0 text-xs text-muted">
                      {t.occ}/{t.total} ห้อง
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${rate}%` }} />
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right max-sm:hidden">
                  <div className="tabular text-sm font-semibold">{money(t.rent)}</div>
                  <div className="tabular text-xs text-muted">จาก {money(t.potential)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ส่งออก */}
      <Section icon={<FileSpreadsheet className="size-4" />} title="ส่งออกข้อมูล (เปิดด้วย Excel ได้)" className="no-print">
        <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
          <ExportTile
            href={`/api/export/payments?year=${year}`}
            icon={<ReceiptText className="size-4" />}
            title={`ใบเสร็จ ปี ${be}`}
            desc="แยกค่าเช่า / เงินประกัน ทุกใบ"
          />
          <ExportTile
            href={`/api/export/invoices?year=${year}`}
            icon={<FileText className="size-4" />}
            title={`ใบวางบิล ปี ${be}`}
            desc="ยอดบิล ภาษี และเงินประกันในบิล"
          />
          <ExportTile href="/api/export/outstanding" icon={<Hourglass className="size-4" />} title="ยอดค้างชำระ" desc="ทุกบิลที่ยังไม่ได้รับเงิน" />
          <ExportTile href="/api/export/contracts" icon={<FileText className="size-4" />} title="สัญญาเช่า" desc="ทุกสัญญา พร้อมเงินประกันคงเหลือ" />
          <ExportTile href="/api/export/tenants" icon={<Users className="size-4" />} title="ผู้เช่า" desc="รายชื่อและข้อมูลติดต่อ" />
          <ExportTile href="/api/export/units" icon={<Warehouse className="size-4" />} title="ห้องและที่จอด" desc="สถานะและราคาทุกห้อง" />
        </div>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "bad";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={clsx("p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
        <span className={clsx("grid size-8 place-items-center rounded-lg", tone === "bad" ? "bg-bad-soft text-bad" : "bg-canvas text-ink-2")}>
          {icon}
        </span>
      </div>
      <div className="tabular mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {children && <div className="mt-0.5 text-xs text-muted">{children}</div>}
    </Card>
  );
}

function Section({
  icon,
  title,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={clsx("mb-4 overflow-hidden", className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-brand">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function CsvLink({ href }: { href: string }) {
  return (
    <Link href={href} className="no-print btn btn-outline btn-sm shrink-0" prefetch={false}>
      <Download className="size-3.5" /> CSV
    </Link>
  );
}

function ExportTile({ href, icon, title, desc }: { href: string; icon: ReactNode; title: string; desc: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-ink/25 hover:bg-canvas/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{desc}</span>
      </span>
      <Download className="size-4 shrink-0 text-muted transition group-hover:text-ink" />
    </Link>
  );
}
