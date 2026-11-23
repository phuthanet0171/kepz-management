import clsx from "clsx";
import { Building2, LayoutGrid, Map as MapIcon, Pencil, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FloorPlanViewer } from "@/components/floor-plan/viewer";
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
              (await isOwner()) && (
                <Link href="/branches/new" className="btn btn-primary">
                  <Plus className="size-4" /> เพิ่มสาขา
                </Link>
              )
            }
          />
        </Card>
      </>
    );
  }

  const branchId = typeof sp.branch === "string" && branches.some((b) => b.id === sp.branch) ? sp.branch : branches[0].id;
  const status = typeof sp.status === "string" ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();
  const [all, overdueRows, { count: planCount }, owner] = await Promise.all([
    fetchAll<UnitView>((from, to) =>
      supabase.from("v_units").select("*").eq("branch_id", branchId).neq("status", "inactive").order("id").range(from, to),
    ),
    fetchAll<{ unit_id: string; is_overdue: boolean }>((from, to) =>
      supabase
        .from("v_invoices")
        .select("unit_id, is_overdue")
        .eq("branch_id", branchId)
        .in("status", ["unpaid", "partial"])
        .order("id")
        .range(from, to),
    ),
    supabase.from("floor_plans").select("id", { count: "exact", head: true }).eq("branch_id", branchId),
    isOwner(),
  ]);
  // เปิดมาเห็นผังก่อน (ถ้าสาขานี้จัดผังไว้แล้ว) ยกเว้นมาจากการค้นหา/กรองสถานะ ซึ่งใช้กับแบบรายการ
  const view = sp.view === "plan" || sp.view === "list" ? sp.view : sp.status || sp.q || !planCount ? "list" : "plan";
  const overdue = new Set(overdueRows.filter((r) => r.is_overdue).map((r) => r.unit_id));
  const pending = new Set(overdueRows.map((r) => r.unit_id));

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
    const params = new URLSearchParams({ branch: branchId, view: "list", status, ...(q ? { q } : {}), ...patch });
    if (params.get("status") === "all") params.delete("status");
    return `/units?${params}`;
  };

  return (
    <>
      <PageHeader
        title="ห้องและที่จอด"
        subtitle={<span className="max-lg:hidden">แตะที่ห้องเพื่อดูผู้เช่า ค่าเช่า และสถานะการชำระ</span>}
        actions={
          owner && (
            <Link href={`/branches/${branchId}/floor-plan`} className="btn btn-brand max-lg:hidden">
              <Pencil className="size-4" /> จัดผัง / เพิ่มห้อง
            </Link>
          )
        }
      />

      {/* สาขา + แบบการดู (ผัง/รายการ) + ปุ่มจัดผังบนมือถือ รวมเป็นแถวเดียว */}
      <div className="mb-3 flex items-center gap-2">
        {branches.length > 1 ? (
          <div className="no-scrollbar -ml-4 min-w-0 flex-1 overflow-x-auto pl-4 sm:ml-0 sm:pl-0">
            <div className="flex gap-2">
              {branches.map((b) => (
                <Link
                  key={b.id}
                  href={`/units?branch=${b.id}`}
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
        ) : (
          <span className="flex-1" />
        )}
        <div className="inline-flex shrink-0 rounded-xl bg-line/50 p-1">
          {(
            [
              ["plan", "ผังสถานที่", MapIcon],
              ["list", "รายการ", LayoutGrid],
            ] as const
          ).map(([v, label, Icon]) => (
            <Link
              key={v}
              href={`/units?branch=${branchId}&view=${v}`}
              aria-label={label}
              title={label}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition sm:px-3.5",
                view === v ? "bg-ink text-white shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" /> <span className="max-sm:hidden">{label}</span>
            </Link>
          ))}
        </div>
        {owner && (
          <Link
            href={`/branches/${branchId}/floor-plan`}
            className="btn btn-brand size-10 min-h-0 shrink-0 p-0 lg:hidden"
            aria-label="จัดผัง / เพิ่มห้อง"
            title="จัดผัง / เพิ่มห้อง"
          >
            <Pencil className="size-4" />
          </Link>
        )}
      </div>

      {view === "plan" ? (
        <PlanView branchId={branchId} planId={typeof sp.plan === "string" ? sp.plan : null} />
      ) : (
        <>
          <form className="relative mb-3" action="/units">
            <input type="hidden" name="branch" value={branchId} />
            <input type="hidden" name="view" value="list" />
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

          <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={link({ status: f.key })}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                    status === f.key ? "bg-ink text-white" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
                  )}
                >
                  {f.label}
                  <span className="tabular text-xs opacity-70">{counts[f.key] ?? 0}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <UnitLegend withOverdue />
          </div>

          {units.length === 0 ? (
            <Card>
              <EmptyState title="ไม่พบห้องตามเงื่อนไข" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
            </Card>
          ) : (
            <div className="space-y-4">
              {groupByType(units).map((g) => (
                <Card key={g.code}>
                  <CardHeader title={g.name} description={`${g.units.length} ห้อง`} />
                  <div className="p-3 sm:p-4">
                    <UnitGrid units={g.units} overdue={overdue} pending={pending} />
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
  const [{ plans, placements, objects, units }, owner] = await Promise.all([getBranchPlanData(branchId), isOwner()]);
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
      <div className="no-scrollbar mb-3 flex items-center gap-2 max-lg:-mx-4 max-lg:overflow-x-auto max-lg:px-4">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/units?branch=${branchId}&view=plan&plan=${p.id}`}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
              p.id === plan.id ? "bg-ink text-white" : "bg-surface text-muted ring-1 ring-line hover:text-ink",
            )}
          >
            {p.name}
          </Link>
        ))}
        <span className="ml-auto shrink-0">
          <RealtimeRefresh />
        </span>
      </div>
      <Card className="p-2 sm:p-3">
        <FloorPlanViewer
          plan={plan}
          placements={placements.filter((p) => p.floor_plan_id === plan.id)}
          objects={objects.filter((o) => o.floor_plan_id === plan.id)}
          units={unitMap}
        />
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
