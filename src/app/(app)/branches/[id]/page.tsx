import { requireOwner } from "@/lib/auth";
import { Map as MapIcon, MapPin, Phone, Warehouse } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { fetchAll } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Branch, UnitView } from "@/lib/types";
import { PurgeButton, type PurgePreview } from "@/components/purge-button";
import { EditBranchButton } from "./branch-actions";

export const metadata: Metadata = { title: "รายละเอียดสาขา" };

export default async function BranchPage({ params }: PageProps<"/branches/[id]">) {
  await requireOwner();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: branch }, units, { data: preview }] = await Promise.all([
    supabase.from("branches").select("*").eq("id", id).maybeSingle(),
    fetchAll<UnitView>((from, to) => supabase.from("v_units").select("*").eq("branch_id", id).order("id").range(from, to)),
    supabase.rpc("purge_preview", { p_kind: "branch", p_id: id }).single<PurgePreview>(),
  ]);
  if (!branch) notFound();
  const b = branch as Branch;

  const active = units.filter((u) => u.status !== "inactive");
  const count = (st: string) => active.filter((u) => u.status === st).length;
  const occ = count("occupied");
  const stats = [
    { label: "ห้องทั้งหมด", value: active.length, cls: "" },
    { label: "มีผู้เช่า", value: occ, cls: "" },
    { label: "ว่าง", value: count("available"), cls: "text-ok" },
    { label: "ปิดปรับปรุง", value: count("maintenance"), cls: "text-muted" },
  ];
  const rate = active.length ? Math.round((occ / active.length) * 100) : 0;

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
        actions={<EditBranchButton branch={b} />}
      />

      <Card className="mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="rounded-xl bg-canvas px-3 py-2.5">
              <div className={`tabular text-2xl font-bold ${st.cls}`}>{st.value}</div>
              <div className="text-xs text-muted">{st.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted">อัตราการเช่า</span>
            <span className="tabular font-semibold">{rate}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="ห้องและที่จอดของสาขานี้" description="ดูสถานะห้อง ผู้เช่า และผังสถานที่ ได้ที่เมนู “ห้องและที่จอด”" />
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          <Link href={`/units?branch=${b.id}`} className="btn btn-brand">
            <Warehouse className="size-4" /> ดูห้องและผัง
          </Link>
          <Link href={`/branches/${b.id}/floor-plan`} className="btn btn-outline">
            <MapIcon className="size-4" /> จัดผัง / เพิ่มห้อง
          </Link>
        </div>
      </Card>

      {preview && (
        <div className="mt-8 flex justify-end">
          <PurgeButton kind="branch" id={b.id} name={b.name} preview={preview} />
        </div>
      )}
    </>
  );
}
