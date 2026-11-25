import { requireOwner } from "@/lib/auth";
import clsx from "clsx";
import { ChevronLeft, Map as MapIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getUnitTypes } from "@/lib/data";
import { getBranchPlanData } from "@/lib/floor-plans";
import { createClient } from "@/lib/supabase/server";
import { FloorPlanEditor } from "./editor";
import { AddPlanButton, DeletePlanButton, FirstPlanForm, PlanMenuButton } from "./plan-actions";

export const metadata: Metadata = { title: "จัดผังสถานที่" };

export default async function FloorPlanEditPage({ params, searchParams }: PageProps<"/branches/[id]/floor-plan">) {
  await requireOwner();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: branch } = await supabase.from("branches").select("id, name").eq("id", id).maybeSingle();
  if (!branch) notFound();

  const [{ plans, placements, objects, units }, unitTypes] = await Promise.all([getBranchPlanData(id), getUnitTypes(id)]);
  const plan = plans.find((p) => p.id === sp.plan) ?? plans[0];

  const header = (
    <PageHeader
      back={{ href: `/units?branch=${id}`, label: `ห้องและที่จอด · ${branch.name}` }}
      title="จัดผังสถานที่"
      subtitle="วาดห้อง ที่จอด และสัญลักษณ์ให้เหมือนสถานที่จริง ห้องที่วาดใหม่พร้อมทำสัญญาทันทีหลังบันทึก"
    />
  );

  if (!plan) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title="ยังไม่มีผังของสาขานี้"
            description="สร้างผังสำหรับแต่ละชั้นหรือโซน แล้ววาดห้อง ที่จอด และสัญลักษณ์ลงไปตามตำแหน่งจริง"
            action={<FirstPlanForm branchId={id} />}
          />
        </Card>
      </>
    );
  }

  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const placedElsewhere: Record<string, string> = {};
  for (const p of placements) if (p.floor_plan_id !== plan.id) placedElsewhere[p.unit_id] = planName.get(p.floor_plan_id) ?? "";

  return (
    <>
      <div className="max-lg:hidden">{header}</div>

      {/* มือถือ: หัวแถวเดียว (ย้อนกลับ · ชั้น/โซน · ⋯) ให้ผังได้พื้นที่มากที่สุด */}
      <div className="-mt-2 mb-2 flex items-center gap-2 lg:hidden">
        <Link
          href={`/units?branch=${id}`}
          aria-label={`กลับไปห้องและที่จอด · ${branch.name}`}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface active:bg-canvas"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/branches/${id}/floor-plan?plan=${p.id}`}
              className={clsx(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                p.id === plan.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2",
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
        <PlanMenuButton branchId={id} planId={plan.id} planName={plan.name} nextIndex={plans.length + 1} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 max-lg:hidden">
        {plans.map((p) => (
          <Link
            key={p.id}
            href={`/branches/${id}/floor-plan?plan=${p.id}`}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              p.id === plan.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30",
            )}
          >
            {p.name}
            <span className="tabular ml-1.5 text-xs opacity-60">{placements.filter((x) => x.floor_plan_id === p.id).length}</span>
          </Link>
        ))}
        <AddPlanButton branchId={id} nextIndex={plans.length + 1} />
        <span className="ml-auto">
          <DeletePlanButton planId={plan.id} branchId={id} name={plan.name} />
        </span>
      </div>


      <FloorPlanEditor
        key={plan.id}
        plan={plan}
        placements={placements.filter((p) => p.floor_plan_id === plan.id)}
        objects={objects.filter((o) => o.floor_plan_id === plan.id)}
        units={units}
        unitTypes={unitTypes}
        placedElsewhere={placedElsewhere}
      />
    </>
  );
}
