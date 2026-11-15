import clsx from "clsx";
import { Building2, LayoutGrid, Map as MapIcon, Pencil, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FloorPlanLegend, FloorPlanViewer } from "@/components/floor-plan/viewer";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { groupByType, UnitGrid, UnitLegend, unitTileState } from "@/components/unit-grid";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { fetchAll, getBranches } from "@/lib/data";
import { getBranchPlanData } from "@/lib/floor-plans";
import { isOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UnitView } from "@/lib/types";

export const metadata: Metadata = { title: "ห้องและที่จอด" };

const STATUS_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "available", label: "ว่าง" },
  { key: "occupied", label: "มีผู้เช่า" },
  { key: "expiring", label: "ใกล้หมดสัญญา" },
  { key: "maintenance", label: "ปิดปรับปรุง" },
] as const;

export default async function UnitsPage({ searchParams }: PageProps<"/units">) {
  const sp = await searchParams;
  const branches = await getBranches();
  if (branches.length === 0) {
    return (
      <>
        <PageHeader title="ห้องและที่จอด" />
        <Card>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีสาขา"
            description="เพิ่มสาขาและระบุจำนวนห้องก่อน แล้วผังห้องจะแสดงที่นี่"
            action={
              (await isOwner()) &&
              <Link href="/branches/new" className="btn btn-primary">
                <Plus className="size-4" /> เพิ่มสาขา
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const branchId = typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : branches[0].id;
  const status = typeof sp.status === "string" ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const view = sp.view === "plan" ? "plan" : "list";

  const supabase = await createClient();
  const all = await fetchAll<UnitView>((from, to) =>
    supabase.from("v_units").select("*").eq("branch_id", branchId).neq("status", "inactive").order("id").range(from, to),
  );

  const counts: Record<string, number> = { all: all.length, available: 0, occupied: 0, expiring: 0, maintenance: 0 };
  for (const u of all) {
    const s = unitTileState(u);
    if (s === "expiring") {
      counts.expiring++;
      counts.occupied++;
    } else counts[s] = (counts[s] ?? 0) + 1;
  }

  const ql = q.toLowerCase();
  const units = all.filter((u) => {
    const s = unitTileState(u);
    if (status === "occupied" && u.status !== "occupied") return false;
    if (status === "expiring" && s !== "expiring") return false;
    if ((status === "available" || status === "maintenance") && u.status !== status) return false;
    if (ql && !u.code.toLowerCase().includes(ql) && !(u.tenant_name ?? "").toLowerCase().includes(ql)) return false;
    return true;
  });

  const link = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ branch: branchId, status, ...(q ? { q } : {}), ...patch });
    if (params.get("status") === "all") params.delete("status");
    return `/units?${params}`;
  };

  return (
    <>
      <PageHeader
        title="ห้องและที่จอด"
        subtitle="แตะที่ห้องเพื่อดูผู้เช่า ค่าเช่า และสถานะการชำระ"
        actions={
          <div className="inline-flex rounded-xl bg-line/50 p-1">
            {(
              [
                ["list", "รายการ", LayoutGrid],
                ["plan", "ผังสถานที่", MapIcon],
              ] as const
            ).map(([v, label, Icon]) => (
              <Link
                key={v}
                href={`/units?branch=${branchId}${v === "plan" ? "&view=plan" : ""}`}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  view === v ? "bg-surface shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </div>
        }
      />

      {branches.length > 1 && (
        <div className="-mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2">
            {branches.map((b) => (
              <Link
                key={b.id}
                href={`/units?branch=${b.id}${view === "plan" ? "&view=plan" : ""}`}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
                  b.id === branchId ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30",
                )}
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {view === "plan" ? (
        <PlanView branchId={branchId} planId={typeof sp.plan === "string" ? sp.plan : null} />
      ) : (
        <>
      <form className="relative mb-3" action="/units">
        <input type="hidden" name="branch" value={branchId} />
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="ค้นหารหัสห้อง หรือชื่อผู้เช่า"
          className="input pl-10"
          type="search"
          enterKeyHint="search"
        />
      </form>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={link({ status: f.key })}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                status === f.key ? "bg-brand text-ink" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
              )}
            >
              {f.label}
              <span className="tabular text-xs opacity-70">{counts[f.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <UnitLegend />
      </div>

      {units.length === 0 ? (
        <Card>
          <EmptyState title="ไม่พบห้องตามเงื่อนไข" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
        </Card>
      ) : (
        <div className="space-y-4">
          {groupByType(units).map((g) => (
            <Card key={g.code}>
              <CardHeader title={g.name} description={`${g.units.length} หน่วย`} />
              <div className="p-3 sm:p-4">
                <UnitGrid units={g.units} />
              </div>
            </Card>
          ))}
        </div>
      )}
        </>
      )}
    </>
  );
}

async function PlanView({ branchId, planId }: { branchId: string; planId: string | null }) {
  const [{ plans, placements, units }, owner] = await Promise.all([getBranchPlanData(branchId), isOwner()]);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];

  if (!plan) {
    return (
      <Card>
        <EmptyState
          icon={<MapIcon className="size-6" />}
          title="ยังไม่ได้จัดผังสถานที่ของสาขานี้"
          description="สร้างผังแต่ละชั้นหรือโซน แล้วลากห้องไปวางตามตำแหน่งจริง ผังจะแสดงสถานะห้องแบบเรียลไทม์"
          action={
            owner && (
            <Link href={`/branches/${branchId}/floor-plan`} className="btn btn-primary">
              <Pencil className="size-4" /> เริ่มจัดผัง
            </Link>
            )
          }
        />
      </Card>
    );
  }

  const unitMap = new Map(units.map((u) => [u.id, u]));
  const placedIds = new Set(placements.map((p) => p.unit_id));
  const unplacedCount = units.filter((u) => u.status !== "inactive" && !placedIds.has(u.id)).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/units?branch=${branchId}&view=plan&plan=${p.id}`}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
              p.id === plan.id ? "bg-brand text-ink" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
            )}
          >
            {p.name}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-3">
          <RealtimeRefresh />
          {owner && (
            <Link href={`/branches/${branchId}/floor-plan?plan=${plan.id}`} className="btn btn-outline btn-sm hidden md:inline-flex">
              <Pencil className="size-3.5" /> จัดผัง
            </Link>
          )}
        </span>
      </div>
      <div className="mb-3">
        <FloorPlanLegend />
      </div>
      <Card className="p-2 sm:p-3">
        <FloorPlanViewer plan={plan} placements={placements.filter((p) => p.floor_plan_id === plan.id)} units={unitMap} />
      </Card>
      {owner && unplacedCount > 0 && (
        <p className="mt-2 text-xs text-muted">
          ยังมี {unplacedCount} ห้องที่ยังไม่ได้วางบนผังใด ๆ{" "}
          <Link href={`/branches/${branchId}/floor-plan?plan=${plan.id}`} className="underline">
            จัดผัง
          </Link>
        </p>
      )}
    </>
  );
}
