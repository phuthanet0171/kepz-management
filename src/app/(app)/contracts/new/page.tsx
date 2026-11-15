import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { fetchAll, getBranches } from "@/lib/data";
import { todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ContractForm, type TenantOption, type UnitOption } from "./contract-form";

export const metadata: Metadata = { title: "ทำสัญญาเช่า" };

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [branches, units, tenants] = await Promise.all([
    getBranches({ activeOnly: true }),
    fetchAll<UnitOption & { type_sort: number }>((from, to) =>
      supabase
        .from("v_units")
        .select("id, code, branch_id, branch_name, unit_type_name, effective_price, type_sort")
        .eq("status", "available")
        .order("type_sort")
        .order("code")
        .range(from, to),
    ),
    fetchAll<TenantOption>((from, to) =>
      supabase.from("tenants").select("id, full_name, phone").order("full_name").range(from, to),
    ),
  ]);

  const activeBranchIds = new Set(branches.map((b) => b.id));
  const collator = new Intl.Collator("th", { numeric: true });
  const availableUnits = units
    .filter((u) => activeBranchIds.has(u.branch_id))
    .sort((a, b) => a.type_sort - b.type_sort || collator.compare(a.code, b.code));

  const back = typeof sp.unit === "string" ? { href: `/units/${sp.unit}`, label: "ห้อง" } : { href: "/contracts", label: "สัญญาเช่า" };

  if (branches.length === 0) {
    return (
      <>
        <PageHeader title="ทำสัญญาเช่า" back={back} />
        <Card>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีสาขาที่เปิดใช้งาน"
            action={
              <Link href="/branches/new" className="btn btn-primary">
                <Plus className="size-4" /> เพิ่มสาขา
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="ทำสัญญาเช่า" back={back} />
      <ContractForm
        units={availableUnits}
        tenants={tenants}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        defaultUnitId={typeof sp.unit === "string" ? sp.unit : null}
        defaultTenantId={typeof sp.tenant === "string" ? sp.tenant : null}
        today={todayTH()}
      />
    </div>
  );
}
