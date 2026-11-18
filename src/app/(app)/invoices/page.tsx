import { CalendarCheck, ReceiptText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RowLink } from "@/components/ui/client";
import { InvoiceStatusBadge } from "@/components/status";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { fetchAll } from "@/lib/data";
import { money, thDate, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BillingDue, InvoiceView } from "@/lib/types";
import { BulkBilling } from "./bulk-billing";

export const metadata: Metadata = { title: "ใบวางบิล" };

const TABS = [
  { key: "due", label: "ถึงรอบออกบิล" },
  { key: "unpaid", label: "ค้างชำระ" },
  { key: "all", label: "ทั้งหมด" },
] as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [due, unpaid] = await Promise.all([
    fetchAll<BillingDue>((from, to) =>
      supabase.from("v_billing_due").select("*").eq("is_due", true).order("period_start").order("contract_id").range(from, to),
    ),
    fetchAll<InvoiceView>((from, to) =>
      supabase.from("v_invoices").select("*").in("status", ["unpaid", "partial"]).order("due_date").order("id").range(from, to),
    ),
  ]);

  const defaultTab = due.length > 0 ? "due" : "unpaid";
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]["key"]) : defaultTab;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayTH().slice(0, 7);

  let list: InvoiceView[] = [];
  if (tab === "unpaid") list = unpaid;
  if (tab === "all") {
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    list = await fetchAll<InvoiceView>((from, to) =>
      supabase
        .from("v_invoices")
        .select("*")
        .gte("issue_date", `${month}-01`)
        .lt("issue_date", `${next}-01`)
        .order("issue_date", { ascending: false })
        .order("invoice_no", { ascending: false })
        .range(from, to),
    );
  }
  if (q) {
    const ql = q.toLowerCase();
    list = list.filter(
      (i) =>
        i.invoice_no.toLowerCase().includes(ql) || i.unit_code.toLowerCase().includes(ql) || i.tenant_name.toLowerCase().includes(ql),
    );
  }
  const outstandingTotal = unpaid.reduce((a, i) => a + Number(i.outstanding), 0);

  return (
    <>
      <PageHeader title="ใบวางบิล" subtitle={`ยอดค้างชำระทั้งหมด ${money(outstandingTotal)} บาท`} />

      <Tabs
        items={TABS.map((t) => ({
          href: `/invoices?tab=${t.key}`,
          label: t.label,
          active: tab === t.key,
          count: t.key === "due" ? due.length : t.key === "unpaid" ? unpaid.length : undefined,
        }))}
      />

      {tab === "due" ? (
        <Card className="overflow-hidden">
          {due.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck className="size-6" />}
              title="ยังไม่มีสัญญาที่ถึงรอบออกบิล"
              description="สัญญาจะแสดงที่นี่ล่วงหน้าก่อนวันเริ่มรอบบิลตามจำนวนวันที่ตั้งไว้ในหน้าตั้งค่า"
            />
          ) : (
            <BulkBilling rows={due} today={todayTH()} />
          )}
        </Card>
      ) : (
        <>
          <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/invoices">
            <input type="hidden" name="tab" value={tab} />
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                name="q"
                defaultValue={q}
                placeholder="ค้นหาเลขที่บิล รหัสห้อง หรือชื่อผู้เช่า"
                className="input pl-10"
                type="search"
                enterKeyHint="search"
              />
            </div>
            {tab === "all" && (
              <div className="flex gap-2">
                <input type="month" name="month" defaultValue={month} className="input sm:w-44" aria-label="เดือนที่ออกบิล" />
                <button className="btn btn-outline">แสดง</button>
              </div>
            )}
          </form>

          <Card className="overflow-hidden">
            {list.length === 0 ? (
              <EmptyState icon={<ReceiptText className="size-6" />} title={tab === "unpaid" ? "ไม่มียอดค้างชำระ" : "ไม่มีใบวางบิลในเดือนนี้"} />
            ) : (
              <>
                <ul className="divide-y divide-line md:hidden">
                  {list.map((i) => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="block px-4 py-3 active:bg-canvas">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {i.unit_code} <span className="font-normal text-muted">· {i.tenant_name}</span>
                          </span>
                          <span className="tabular font-semibold">{money(tab === "unpaid" ? i.outstanding : i.total)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                          <span>
                            {i.invoice_no} · ครบกำหนด {thDate(i.due_date)}
                          </span>
                          <InvoiceStatusBadge status={i.status} overdue={i.is_overdue} days={i.days_overdue} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>เลขที่</th>
                        <th>ห้อง / ผู้เช่า</th>
                        <th>รอบบิล</th>
                        <th>ครบกำหนด</th>
                        <th className="text-right">ยอดรวม</th>
                        <th className="text-right">คงค้าง</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((i) => (
                        <RowLink key={i.id} href={`/invoices/${i.id}`}>
                          <td>
                            <Link href={`/invoices/${i.id}`} className={`font-medium hover:underline ${i.status === "void" ? "text-muted line-through" : ""}`}>
                              {i.invoice_no}
                            </Link>
                          </td>
                          <td>
                            {i.unit_code}
                            <div className="text-xs text-muted">{i.tenant_name}</div>
                          </td>
                          <td className="whitespace-nowrap text-muted">
                            {i.period_start ? `${thDate(i.period_start)} – ${thDate(i.period_end)}` : "-"}
                          </td>
                          <td className="whitespace-nowrap">{thDate(i.due_date)}</td>
                          <td className="tabular text-right">{money(i.total)}</td>
                          <td className={`tabular text-right ${Number(i.outstanding) > 0 && i.status !== "void" ? "font-medium text-bad" : "text-muted"}`}>
                            {i.status === "void" ? "-" : money(i.outstanding)}
                          </td>
                          <td>
                            <InvoiceStatusBadge status={i.status} overdue={i.is_overdue} days={i.days_overdue} />
                          </td>
                        </RowLink>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
