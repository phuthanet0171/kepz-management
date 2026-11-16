import { requireOwner } from "@/lib/auth";
import { Map as MapIcon, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { groupByType, UnitGrid, UnitLegend } from "@/components/unit-grid";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { fetchAll, getUnitTypes } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Branch, UnitView } from "@/lib/types";
import { PurgeButton, type PurgePreview } from "@/components/purge-button";
import { AddUnitsButton, EditBranchButton } from "./branch-actions";

export const metadata: Metadata = { title: "รายละเอียดสาขา" };

export default async function BranchPage({ params }: PageProps<"/branches/[id]">) {
  await requireOwner();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: branch }, units, unitTypes, { data: preview }] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).maybeSingle(),
    fetchAll<UnitView>((from, to) => supabase.from("v_units").select("*").eq("branch_id", id).order("id").range(from, to)),
    getUnitTypes(),
    supabase.rpc("purge_preview", { p_kind: "branch", p_id: id }).single<PurgePreview>(),
  ]);
  if (!branch) notFound();
  const b = branch as Branch;

  const groups = groupByType(units);

  return (
    <>
      <PageHeader
        back={{ href: "/branches", label: "สาขา" }}
        title={
          <span className="flex items-center gap-2">
            {b.name} {!b.is_active && <Badge>ปิดใช้งาน</Badge>}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap gap-x-4 gap-y-0.5">
            {b.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {b.address}
              </span>
            )}
            {b.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {b.phone}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Link href={`/branches/${b.id}/floor-plan`} className="btn btn-outline">
              <MapIcon className="size-4" /> จัดผังสถานที่
            </Link>
            <EditBranchButton branch={b} />
            <AddUnitsButton branchId={b.id} unitTypes={unitTypes} />
          </>
        }
      />

      <Card className="mb-4 overflow-hidden">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th className="text-right">ทั้งหมด</th>
                <th className="text-right">มีผู้เช่า</th>
                <th className="text-right">ว่าง</th>
                <th className="text-right">ปิดปรับปรุง</th>
                <th className="text-right">อัตราการเช่า</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const active = g.units.filter((u) => u.status !== "inactive");
                const occ = active.filter((u) => u.status === "occupied").length;
                return (
                  <tr key={g.code}>
                    <td className="font-medium">{g.name}</td>
                    <td className="tabular text-right">{active.length}</td>
                    <td className="tabular text-right">{occ}</td>
                    <td className="tabular text-right text-ok">{active.filter((u) => u.status === "available").length}</td>
                    <td className="tabular text-right text-muted">
                      {active.filter((u) => u.status === "maintenance").length}
                    </td>
                    <td className="tabular text-right font-medium">
                      {active.length ? Math.round((occ / active.length) * 100) : 0}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-3">
        <UnitLegend />
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.code}>
            <CardHeader title={g.name} description={`${g.units.length} หน่วย`} />
            <div className="p-3 sm:p-4">
              <UnitGrid units={g.units} />
            </div>
          </Card>
        ))}
      </div>

      {preview && (
        <div className="mt-8 flex justify-end">
          <PurgeButton kind="branch" id={b.id} name={b.name} preview={preview} />
        </div>
      )}
    </>
  );
}
