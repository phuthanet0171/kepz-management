import "server-only";
import type { createClient } from "./supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** วันที่ครบกำหนดชำระของสัญญา: ค่าของสาขา (ถ้าตั้งไว้) ไม่งั้นใช้ค่ากลางในตั้งค่า */
export async function rentDueDayFor(supabase: Supa, contractIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!contractIds.length) return out;
  const [{ data: rows }, { data: s }] = await Promise.all([
    supabase.from("v_contracts").select("id, branch_id").in("id", contractIds),
    supabase.from("settings").select("rent_due_day").eq("id", 1).maybeSingle(),
  ]);
  const branchIds = [...new Set((rows ?? []).map((r) => r.branch_id as string))];
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, rent_due_day").in("id", branchIds)
    : { data: [] as { id: string; rent_due_day: number | null }[] };
  const byBranch = new Map((branches ?? []).map((b) => [b.id as string, b.rent_due_day as number | null]));
  for (const r of rows ?? []) {
    const own = byBranch.get(r.branch_id as string);
    out.set(r.id as string, own ?? (s?.rent_due_day as number | null) ?? null);
  }
  return out;
}
