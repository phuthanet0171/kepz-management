"use server";

import { ownerOnlyError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { num, reqStr } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function createFloorPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const branchId = reqStr(fd, "branch_id");
  const name = reqStr(fd, "name");
  const cols = num(fd, "cols") ?? 48;
  const rows = num(fd, "rows") ?? 32;
  if (!name) return { error: "กรุณาตั้งชื่อชั้น / โซน" };
  if (name.length > 50) return { error: "ชื่อยาวได้ไม่เกิน 50 ตัวอักษร" };
  if (!Number.isInteger(cols) || cols < 10 || cols > 300 || !Number.isInteger(rows) || rows < 10 || rows > 300) {
    return { error: "ขนาดผังต้องอยู่ระหว่าง 10–300 ช่อง" };
  }

  const supabase = await createClient();
  const { count } = await supabase.from("floor_plans").select("id", { count: "exact", head: true }).eq("branch_id", branchId);
  const { data, error } = await supabase
    .from("floor_plans")
    .insert({ branch_id: branchId, name, cols, rows, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "มีชั้น / โซนชื่อนี้อยู่แล้ว" };
    return { error: thaiError(error, "สร้างผังไม่สำเร็จ") };
  }

  revalidatePath("/", "layout");
  redirect(`/branches/${branchId}/floor-plan?plan=${data.id}`);
}

export async function deleteFloorPlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const id = reqStr(fd, "id");
  const branchId = reqStr(fd, "branch_id");
  const supabase = await createClient();
  const { error } = await supabase.from("floor_plans").delete().eq("id", id);
  if (error) return { error: thaiError(error, "ลบผังไม่สำเร็จ") };
  revalidatePath("/", "layout");
  redirect(`/branches/${branchId}/floor-plan`);
}

export type SavePlanInput = {
  planId: string;
  name: string;
  cols: number;
  rows: number;
  placements: { unit_id: string; x: number; y: number; w: number; h: number }[];
};

export async function saveFloorPlan(input: SavePlanInput): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const name = input.name.trim();
  if (!name) return { error: "กรุณาตั้งชื่อชั้น / โซน" };
  const ints = [input.cols, input.rows, ...input.placements.flatMap((p) => [p.x, p.y, p.w, p.h])];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return { error: "ข้อมูลผังไม่ถูกต้อง" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_floor_plan", {
    p_plan_id: input.planId,
    p_name: name,
    p_cols: input.cols,
    p_rows: input.rows,
    p_placements: input.placements,
  });
  if (error) {
    if (error.code === "23505") return { error: "มีชั้น / โซนชื่อนี้อยู่แล้ว" };
    return { error: thaiError(error, "บันทึกผังไม่สำเร็จ") };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกผังแล้ว" };
}
