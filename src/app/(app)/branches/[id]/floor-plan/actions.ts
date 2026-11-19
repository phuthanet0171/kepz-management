"use server";

import { ownerOnlyError } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { num, reqStr } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, PlanColor, PlanShape } from "@/lib/types";

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

type BoxInput = { x: number; y: number; w: number; h: number; shape: PlanShape };

export type SavePlanInput = {
  planId: string;
  name: string;
  cols: number;
  rows: number;
  placements: (BoxInput & { unit_id: string })[];
  objects: (BoxInput & { id: string; label: string; color: PlanColor })[];
  newUnits: { id: string; code: string; unit_type_code: string }[];
  renames: { id: string; code: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHAPES = new Set(["rect", "circle"]);
const COLORS = new Set(["gray", "yellow", "black", "blue", "green", "red", "orange", "none"]);

export async function saveFloorPlan(input: SavePlanInput): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const name = input.name.trim();
  if (!name) return { error: "กรุณาตั้งชื่อชั้น / โซน" };
  const boxes = [...input.placements, ...input.objects];
  const ints = [input.cols, input.rows, ...boxes.flatMap((p) => [p.x, p.y, p.w, p.h])];
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return { error: "ข้อมูลผังไม่ถูกต้อง" };
  if (boxes.some((b) => !SHAPES.has(b.shape))) return { error: "รูปทรงไม่ถูกต้อง" };
  if (input.objects.some((o) => !UUID.test(o.id) || !COLORS.has(o.color) || o.label.length > 40)) {
    return { error: "ข้อมูลสัญลักษณ์ไม่ถูกต้อง" };
  }
  const codes = [...input.newUnits, ...input.renames];
  if (codes.some((u) => !UUID.test(u.id))) return { error: "ข้อมูลห้องไม่ถูกต้อง" };
  if (codes.some((u) => { const c = u.code.trim(); return c.length < 1 || c.length > 20; })) {
    return { error: "ชื่อห้องต้องมี 1–20 ตัวอักษร" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_floor_plan_v2", {
    p_plan_id: input.planId,
    p_name: name,
    p_cols: input.cols,
    p_rows: input.rows,
    p_placements: input.placements,
    p_objects: input.objects,
    p_new_units: input.newUnits,
    p_renames: input.renames,
  });

  if (error) {
    // ยังไม่ได้รัน 0010: ถ้าแค่จัดตำแหน่งห้องเดิม (ไม่มีของใหม่) ยังบันทึกแบบเดิมได้
    const missing = error.code === "PGRST202" || error.code === "42883" || error.message?.includes("schema cache");
    if (missing) {
      const usesNew =
        input.objects.length > 0 || input.newUnits.length > 0 || input.renames.length > 0 || input.placements.some((p) => p.shape !== "rect");
      if (usesNew) {
        return { error: "ฟีเจอร์ใหม่ของผัง (วาดห้อง สัญลักษณ์ วงกลม ตั้งชื่อ) ต้องรันไฟล์ 0010_floor_plan_shapes.sql ใน Supabase ก่อน" };
      }
      const old = await supabase.rpc("save_floor_plan", {
        p_plan_id: input.planId,
        p_name: name,
        p_cols: input.cols,
        p_rows: input.rows,
        p_placements: input.placements.map(({ unit_id, x, y, w, h }) => ({ unit_id, x, y, w, h })),
      });
      if (old.error) return { error: thaiError(old.error, "บันทึกผังไม่สำเร็จ") };
    } else {
      if (error.code === "23505" && error.message?.includes("floor_plans_branch_name_key")) return { error: "มีชั้น / โซนชื่อนี้อยู่แล้ว" };
      if (error.code === "23505" && error.message?.includes("units_branch_code_key")) {
        return { error: "มีชื่อห้องซ้ำกับห้องอื่นในสาขานี้ กรุณาเปลี่ยนชื่อ" };
      }
      return { error: thaiError(error, "บันทึกผังไม่สำเร็จ") };
    }
  }
  revalidatePath("/", "layout");
  const added = input.newUnits.length;
  return { ok: true, message: added ? `บันทึกผังแล้ว · เพิ่มห้องใหม่ ${added} ห้อง พร้อมทำสัญญาได้ทันที` : "บันทึกผังแล้ว" };
}
