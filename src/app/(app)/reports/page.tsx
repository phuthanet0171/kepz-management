import { requireOwner } from "@/lib/auth";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { fetchAll, getBranches } from "@/lib/data";
import { money, thMonth, todayTH } from "@/lib/format";
import { AGING_BUCKETS, agingBucket, getInvoicesInRange, getOutstanding, getPaymentsInRange } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { UnitView } from "@/lib/types";

export const metadata: Metadata = { title: "รายงาน" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireOwner();
  const sp = await searchParams;
  const supabase = await createClient();
  const currentYear = Number(todayTH().slice(0, 4));
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

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const monthly = months.map((m) => {
    const ps = activePayments.filter((p) => p.paid_on.startsWith(m));
    const inv = validInvoices.filter((i) => i.issue_date.startsWith(m));
    return {
      month: m,
      invoiced: inv.reduce((a, i) => a + Number(i.total), 0),
      vat: inv.reduce((a, i) => a + Number(i.vat_amount), 0),
      transfer: ps.filter((p) => p.method === "transfer").reduce((a, p) => a + Number(p.amount), 0),
      card: ps.filter((p) => p.method === "credit_card").reduce((a, p) => a + Number(p.amount), 0),
      received: ps.reduce((a, p) => a + Number(p.amount), 0),
    };
  });
  const sum = (k: "invoiced" | "vat" | "transfer" | "card" | "received") => monthly.reduce((a, m) => a + m[k], 0);
  const maxReceived = Math.max(1, ...monthly.map((m) => m.received));

  const byBranch = branches.map((b) => ({
    name: b.name,
    received: activePayments.filter((p) => p.invoices.contracts.units.branch_id === b.id).reduce((a, p) => a + Number(p.amount), 0),
    outstanding: outstanding.filter((i) => i.branch_id === b.id).reduce((a, i) => a + Number(i.outstanding), 0),
  }));

  const aging = AGING_BUCKETS.map((label) => {
    const rows = outstanding.filter((i) => agingBucket(i) === label);
    return { label, count: rows.length, amount: rows.reduce((a, i) => a + Number(i.outstanding), 0) };
  });
  const outstandingTotal = aging.reduce((a, b) => a + b.amount, 0);

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
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <>
      <PageHeader
        title="รายงาน"
        subtitle={`ปี พ.ศ. ${year + 543}`}
        actions={
          <form action="/reports" className="flex gap-2">
            <select name="year" defaultValue={year} className="input w-32" aria-label="ปี">
              {years.map((y) => (
                <option key={y} value={y}>
                  พ.ศ. {y + 543}
                </option>
              ))}
            </select>
            <button className="btn btn-outline">แสดง</button>
          </form>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="bg-ink p-4 text-white">
          <div className="text-sm text-white/60">รับชำระทั้งปี</div>
          <div className="tabular mt-1 text-xl font-bold sm:text-2xl">{money(sum("received"))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">ออกใบวางบิลทั้งปี</div>
          <div className="tabular mt-1 text-xl font-bold sm:text-2xl">{money(sum("invoiced"))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">ยอดค้างชำระปัจจุบัน</div>
          <div className="tabular mt-1 text-xl font-bold text-bad sm:text-2xl">{money(outstandingTotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted">ภาษีขายทั้งปี</div>
          <div className="tabular mt-1 text-xl font-bold sm:text-2xl">{money(sum("vat"))}</div>
        </Card>
      </div>

      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title="รายรับรายเดือน"
          description="รับชำระ = ตามวันที่รับเงิน · ออกบิล = ตามวันที่ออกใบวางบิล"
          action={
            <Link href={`/api/export/payments?year=${year}`} className="btn btn-outline btn-sm" prefetch={false}>
              <Download className="size-3.5" /> CSV
            </Link>
          }
        />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="w-1/4"></th>
                <th className="text-right">ออกบิล</th>
                <th className="text-right">โอน/พร้อมเพย์</th>
                <th className="text-right">บัตรเครดิต</th>
                <th className="text-right">รับชำระรวม</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td className="whitespace-nowrap">{thMonth(m.month)}</td>
                  <td>
                    <div className="h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${(m.received / maxReceived) * 100}%` }} />
                    </div>
                  </td>
                  <td className="tabular text-right text-muted">{money(m.invoiced)}</td>
                  <td className="tabular text-right">{money(m.transfer)}</td>
                  <td className="tabular text-right">{money(m.card)}</td>
                  <td className="tabular text-right font-semibold">{money(m.received)}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-bold">
                <td>รวม</td>
                <td></td>
                <td className="tabular text-right">{money(sum("invoiced"))}</td>
                <td className="tabular text-right">{money(sum("transfer"))}</td>
                <td className="tabular text-right">{money(sum("card"))}</td>
                <td className="tabular text-right">{money(sum("received"))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="ยอดค้างชำระตามอายุหนี้"
            action={
              <Link href="/api/export/outstanding" className="btn btn-outline btn-sm" prefetch={false}>
                <Download className="size-3.5" /> CSV
              </Link>
            }
          />
          <table className="table min-w-0">
            <tbody>
              {aging.map((a) => (
                <tr key={a.label}>
                  <td>{a.label}</td>
                  <td className="tabular text-right text-muted">{a.count} ใบ</td>
                  <td className={`tabular text-right font-semibold ${a.label !== AGING_BUCKETS[0] && a.amount > 0 ? "text-bad" : ""}`}>
                    {money(a.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title={`แยกตามสาขา (ปี ${year + 543})`} />
          <table className="table min-w-0">
            <thead>
              <tr>
                <th>สาขา</th>
                <th className="text-right">รับชำระ</th>
                <th className="text-right">ค้างชำระ</th>
              </tr>
            </thead>
            <tbody>
              {byBranch.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td className="tabular text-right">{money(b.received)}</td>
                  <td className={`tabular text-right ${b.outstanding > 0 ? "text-bad" : "text-muted"}`}>{money(b.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title="อัตราการเช่าและรายได้ตามประเภท (ปัจจุบัน)"
          description="ค่าเช่าตามสัญญาเทียบกับรายได้เต็มศักยภาพ หากเช่าเต็มทุกห้องในราคาตั้งต้น"
          action={
            <Link href="/api/export/units" className="btn btn-outline btn-sm" prefetch={false}>
              <Download className="size-3.5" /> CSV
            </Link>
          }
        />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th className="text-right">ทั้งหมด</th>
                <th className="text-right">มีผู้เช่า</th>
                <th className="text-right">อัตราการเช่า</th>
                <th className="text-right">ค่าเช่า/เดือน</th>
                <th className="text-right">เต็มศักยภาพ/เดือน</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.name}>
                  <td className="font-medium">{t.name}</td>
                  <td className="tabular text-right">{t.total}</td>
                  <td className="tabular text-right">{t.occ}</td>
                  <td className="tabular text-right font-semibold">{t.total ? Math.round((t.occ / t.total) * 100) : 0}%</td>
                  <td className="tabular text-right">{money(t.rent)}</td>
                  <td className="tabular text-right text-muted">{money(t.potential)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="ส่งออกข้อมูล (CSV เปิดด้วย Excel ได้)" />
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <Link href={`/api/export/invoices?year=${year}`} className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> ใบวางบิล ปี {year + 543}
          </Link>
          <Link href={`/api/export/payments?year=${year}`} className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> ใบเสร็จ ปี {year + 543}
          </Link>
          <Link href="/api/export/outstanding" className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> ยอดค้างชำระ
          </Link>
          <Link href="/api/export/contracts" className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> สัญญาเช่า
          </Link>
          <Link href="/api/export/tenants" className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> ผู้เช่า
          </Link>
          <Link href="/api/export/units" className="btn btn-outline" prefetch={false}>
            <Download className="size-4" /> ห้องและที่จอด
          </Link>
        </div>
      </Card>
    </>
  );
}
