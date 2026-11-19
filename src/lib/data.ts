import "server-only";
import { createClient } from "./supabase/server";
import type { Branch, DocWatermark, Settings, UnitType } from "./types";

const PAGE = 1000;

/**
 * Supabase จำกัดผลลัพธ์ไม่เกิน 1,000 แถวต่อคำขอ ฟังก์ชันนี้ดึงทีละหน้าจนครบ
 * ตัวอย่าง: fetchAll((from, to) => supabase.from("v_units").select("*").order("code").range(from, to))
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await build(from, from + PAGE - 1);
    if (res.error) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const data = (res.data ?? []) as T[];
    rows.push(...data);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function getSettings(): Promise<Settings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error("โหลดการตั้งค่าไม่สำเร็จ");
  return data as Settings;
}

/** ลายน้ำบนเอกสาร (null = ยังไม่ได้รัน migration 0009 หรืออ่านไม่ได้ เอกสารยังพิมพ์ได้ตามปกติ) */
export async function getWatermark(): Promise<DocWatermark | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("doc_watermark").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return data as DocWatermark;
}

/**
 * ประเภทห้อง ถ้าระบุสาขา ราคา (default_monthly_price) และขนาด (size_label) จะเป็นของสาขานั้น
 * (ถ้ายังไม่ได้รัน 0012 จะใช้ราคาตั้งต้นของระบบ)
 */
export async function getUnitTypes(branchId?: string): Promise<UnitType[]> {
  const supabase = await createClient();
  const [{ data, error }, branchRows] = await Promise.all([
    supabase.from("unit_types").select("*").order("sort_order"),
    branchId
      ? supabase
          .from("branch_unit_types")
          .select("unit_type_code, monthly_price, size_label")
          .eq("branch_id", branchId)
          .then(({ data: rows, error: e }) => (e ? [] : (rows ?? [])))
      : Promise.resolve([] as { unit_type_code: string; monthly_price: number; size_label: string | null }[]),
  ]);
  if (error) throw new Error("โหลดประเภทห้องไม่สำเร็จ");
  const byCode = new Map(branchRows.map((r) => [r.unit_type_code, r]));
  return ((data ?? []) as UnitType[]).map((t) => {
    const b = byCode.get(t.code);
    return b ? { ...t, default_monthly_price: Number(b.monthly_price), size_label: b.size_label } : t;
  });
}

export async function getBranches({ activeOnly = false } = {}): Promise<Branch[]> {
  const supabase = await createClient();
  let q = supabase.from("branches").select("*").order("created_at");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error("โหลดข้อมูลสาขาไม่สำเร็จ");
  return (data ?? []) as Branch[];
}
