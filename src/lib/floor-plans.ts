import "server-only";
import { fetchAll } from "./data";
import { createClient } from "./supabase/server";
import type { FloorPlan, Placement, PlanObject, PlanUnit, UnitView } from "./types";

/** โหลดผังทั้งหมดของสาขา พร้อมตำแหน่งห้องและสถานะห้องล่าสุด */
export async function getBranchPlanData(branchId: string) {
  const supabase = await createClient();

  const [{ data: planData }, units, overdue] = await Promise.all([
    supabase.from("floor_plans").select("*").eq("branch_id", branchId).order("sort_order").order("created_at"),
    fetchAll<UnitView>((a, b) => supabase.from("v_units").select("*").eq("branch_id", branchId).order("id").range(a, b)),
    // บิลที่ยังไม่ชำระครบ: เลยกำหนด = ค้างชำระ (แดง !) · ยังไม่ถึงกำหนด = รอชำระ (ส้ม)
    fetchAll<{ unit_id: string; is_overdue: boolean }>((a, b) =>
      supabase
        .from("v_invoices")
        .select("unit_id, is_overdue")
        .eq("branch_id", branchId)
        .in("status", ["unpaid", "partial"])
        .order("id")
        .range(a, b),
    ),
  ]);
  const plans = (planData ?? []) as FloorPlan[];

  const planIds = plans.map((p) => p.id);
  const [placements, objects] = plans.length
    ? await Promise.all([
        fetchAll<Placement>((a, b) =>
          supabase.from("unit_placements").select("*").in("floor_plan_id", planIds).order("unit_id").range(a, b),
        ),
        // ยังไม่ได้รัน 0010 = ยังไม่มีตารางสัญลักษณ์ ให้แสดงผังได้ตามปกติ
        supabase
          .from("plan_objects")
          .select("*")
          .in("floor_plan_id", planIds)
          .then(({ data, error }) => (error ? [] : ((data ?? []) as PlanObject[]))),
      ])
    : [[] as Placement[], [] as PlanObject[]];

  const overdueUnits = new Set(overdue.filter((o) => o.is_overdue).map((o) => o.unit_id));
  const unpaidUnits = new Set(overdue.map((o) => o.unit_id));
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
    has_unpaid: unpaidUnits.has(u.id),
    contract_rent: u.contract_rent,
    contract_end_date: u.contract_end_date,
  }));

  return { plans, placements, objects, units: planUnits };
}
