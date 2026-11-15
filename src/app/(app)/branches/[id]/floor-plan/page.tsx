import clsx from "clsx";
import { Eye, Map as MapIcon, MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getBranchPlanData } from "@/lib/floor-plans";
import { createClient } from "@/lib/supabase/server";
import { FloorPlanEditor } from "./editor";
import { AddPlanButton, DeletePlanButton, FirstPlanForm } from "./plan-actions";

export const metadata: Metadata = { title: "จัดผังสถานที่" };

export default async function FloorPlanEditPage({ params, searchParams }: PageProps<"/branches/[id]/floor-plan">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: branch } = await supabase.from("branches").select("id, name").eq("id", id).maybeSingle();
  if (!branch) notFound();

  const { plans, placements, units } = await getBranchPlanData(id);
  const plan = plans.find((p) => p.id === sp.plan) ?? plans[0];

  const header = (
    <PageHeader
      back={{ href: `/branches/${id}`, label: branch.name }}
      title="จัดผังสถานที่"
      subtitle="ลากกล่องห้องจัดวางให้เหมือนสถานที่จริง"
      actions={
        plan && (
          <Link href={`/units?branch=${id}&view=plan&plan=${plan.id}`} className="btn btn-outline">
            <Eye className="size-4" /> ดูผังเรียลไทม์
          </Link>
        )
      }
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
            description="สร้างผังสำหรับแต่ละชั้นหรือโซน แล้วลากห้องลงไปวางตามตำแหน่งจริง"
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
      {header}

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      <div className="mb-4 flex items-center gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info md:hidden">
        <MonitorSmartphone className="size-4 shrink-0" />
        การจัดผังเหมาะกับคอมพิวเตอร์หรือแท็บเล็ต บนมือถือแนะนำให้ใช้ “ดูผังเรียลไทม์”
      </div>

      <FloorPlanEditor
        key={plan.id}
        plan={plan}
        placements={placements.filter((p) => p.floor_plan_id === plan.id)}
        units={units}
        placedElsewhere={placedElsewhere}
      />
    </>
  );
}
