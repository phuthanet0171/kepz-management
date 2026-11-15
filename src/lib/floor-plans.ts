import "server-only";
import { fetchAll } from "./data";
import { createClient } from "./supabase/server";
import type { FloorPlan, Placement, PlanUnit, UnitView } from "./types";

/** โหลดผังทั้งหมดของสาขา พร้อมตำแหน่งห้องและสถานะห้องล่าสุด */
export async function getBranchPlanData(branchId: string) {
  const supabase = await createClient();

  const [{ data: planData }, units, overdue] = await Promise.all([
    supabase.from("floor_plans").select("*").eq("branch_id", branchId).order("sort_order").order("created_at"),
    fetchAll<UnitView>((a, b) => supabase.from("v_units").select("*").eq("branch_id", branchId).order("id").range(a, b)),
    fetchAll<{ unit_id: string }>((a, b) =>
      supabase
        .from("v_invoices")
        .select("unit_id")
        .eq("branch_id", branchId)
        .eq("is_overdue", true)
        .order("id")
        .range(a, b),
    ),
  ]);
  const plans = (planData ?? []) as FloorPlan[];

  const placements = plans.length
    ? await fetchAll<Placement>((a, b) =>
        supabase
          .from("unit_placements")
          .select("*")
          .in(
            "floor_plan_id",
            plans.map((p) => p.id),
          )
          .order("unit_id")
          .range(a, b),
      )
    : [];

  const overdueUnits = new Set(overdue.map((o) => o.unit_id));
  const planUnits: PlanUnit[] = units.map((u) => ({
    id: u.id,
    code: u.code,
    unit_type_code: u.unit_type_code,
    unit_type_name: u.unit_type_name,
    type_sort: u.type_sort,
    status: u.status,
    is_expiring: u.is_expiring,
    tenant_name: u.tenant_name,
    has_overdue: overdueUnits.has(u.id),
  }));

  return { plans, placements, units: planUnits };
}
