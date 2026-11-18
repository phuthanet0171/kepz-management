import { FileSignature, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RowLink } from "@/components/ui/client";
import { ContractStatusBadge } from "@/components/status";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { fetchAll } from "@/lib/data";
import { baht, BILLING_CYCLE_LABEL, money, thDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContractView } from "@/lib/types";

export const metadata: Metadata = { title: "สัญญาเช่า" };

const TABS = [
  { key: "active", label: "ใช้งานอยู่" },
  { key: "expiring", label: "ใกล้หมดสัญญา" },
  { key: "ended", label: "สิ้นสุด/ยกเลิก" },
] as const;

export default async function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as (typeof TABS)[number]["key"]) : "active";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const supabase = await createClient();
  const all = await fetchAll<ContractView>((from, to) =>
    supabase.from("v_contracts").select("*").order("end_date").range(from, to),
  );

  const counts = {
    active: all.filter((c) => c.status === "active").length,
    expiring: all.filter((c) => c.status === "active" && c.is_expiring).length,
    ended: all.filter((c) => c.status !== "active").length,
  };

  const list = all
    .filter((c) =>
      tab === "active" ? c.status === "active" : tab === "expiring" ? c.status === "active" && c.is_expiring : c.status !== "active",
    )
    .filter(
      (c) =>
        !q ||
        c.contract_no.toLowerCase().includes(q) ||
        c.unit_code.toLowerCase().includes(q) ||
        c.tenant_name.toLowerCase().includes(q),
    );
  if (tab === "ended") list.sort((a, b) => (b.ended_on ?? "").localeCompare(a.ended_on ?? ""));

  return (
    <>
      <PageHeader
        title="สัญญาเช่า"
        actions={
          <Link href="/contracts/new" className="btn btn-primary">
            <Plus className="size-4" /> ทำสัญญาใหม่
          </Link>
        }
      />

      <Tabs
        items={TABS.map((t) => ({
          href: `/contracts?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          label: t.label,
          active: tab === t.key,
          count: counts[t.key],
        }))}
      />

      <form className="relative mb-4" action="/contracts">
        <input type="hidden" name="tab" value={tab} />
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="ค้นหาเลขสัญญา รหัสห้อง หรือชื่อผู้เช่า"
          className="input pl-10"
          type="search"
          enterKeyHint="search"
        />
      </form>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<FileSignature className="size-6" />} title="ไม่มีสัญญาในรายการนี้" />
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {list.map((c) => (
                <li key={c.id}>
                  <Link href={`/contracts/${c.id}`} className="block px-4 py-3 active:bg-canvas">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {c.unit_code} <span className="font-normal text-muted">· {c.tenant_name}</span>
                      </span>
                      <ContractStatusBadge status={c.status} expiring={c.is_expiring} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted">
                      <span>
                        {thDate(c.start_date)} – {thDate(c.ended_on ?? c.end_date)}
                      </span>
                      <span className="tabular">
                        {baht(c.monthly_rent)}/ด.
                        {Number(c.outstanding) > 0 && <span className="ml-1 text-bad">ค้าง {money(c.outstanding)}</span>}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>เลขที่สัญญา</th>
                    <th>ห้อง</th>
                    <th>ผู้เช่า</th>
                    <th>ระยะสัญญา</th>
                    <th>รอบชำระ</th>
                    <th className="text-right">ค่าเช่า/เดือน</th>
                    <th className="text-right">ค้างชำระ</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <RowLink key={c.id} href={`/contracts/${c.id}`}>
                      <td>
                        <Link href={`/contracts/${c.id}`} className="font-medium hover:underline">
                          {c.contract_no}
                        </Link>
                      </td>
                      <td>
                        {c.unit_code}
                        <div className="text-xs text-muted">{c.branch_name}</div>
                      </td>
                      <td>{c.tenant_name}</td>
                      <td className="whitespace-nowrap">
                        {thDate(c.start_date)} – {thDate(c.ended_on ?? c.end_date)}
                      </td>
                      <td>{BILLING_CYCLE_LABEL[c.billing_cycle]}</td>
                      <td className="tabular text-right">{money(c.monthly_rent)}</td>
                      <td className={`tabular text-right ${Number(c.outstanding) > 0 ? "text-bad" : "text-muted"}`}>
                        {Number(c.outstanding) > 0 ? money(c.outstanding) : "-"}
                      </td>
                      <td>
                        <ContractStatusBadge status={c.status} expiring={c.is_expiring} />
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
  );
}
