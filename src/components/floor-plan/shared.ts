import type { PlanColor, PlanUnit } from "@/lib/types";

/** ขนาดกล่องตั้งต้น (จำนวนช่องตาราง กว้าง × สูง) ตามประเภทห้อง */
export const DEFAULT_BOX: Record<string, { w: number; h: number }> = {
  XS: { w: 2, h: 2 },
  S: { w: 3, h: 2 },
  M: { w: 3, h: 3 },
  L: { w: 4, h: 4 },
  PARKING: { w: 3, h: 5 },
};

export function defaultBox(typeCode: string) {
  return DEFAULT_BOX[typeCode] ?? { w: 2, h: 2 };
}

/** ขนาดช่องตาราง (px) ที่ zoom = 1 */
export const BASE_CELL = 24;

export type Rect = { x: number; y: number; w: number; h: number };

export function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** หาตำแหน่งว่างแรก (ซ้ายไปขวา บนลงล่าง) ที่วางกล่องขนาด w×h ได้ */
export function findFreeSpot(
  rects: Rect[],
  w: number,
  h: number,
  cols: number,
  rows: number,
  start: { x: number; y: number } = { x: 0, y: 0 },
) {
  for (let y = start.y; y + h <= rows; y++) {
    for (let x = y === start.y ? start.x : 0; x + w <= cols; x++) {
      const r = { x, y, w, h };
      if (!rects.some((o) => overlaps(o, r))) return r;
    }
  }
  return null;
}

export type TileState = "available" | "occupied" | "expiring" | "overdue" | "maintenance" | "inactive";

/** สีของห้องตามสถานะ (ค้างชำระสำคัญที่สุด แสดงเป็นสีแดงพร้อมป้าย !) */
export function tileState(u: Pick<PlanUnit, "status" | "is_expiring" | "has_overdue">): TileState {
  if (u.status === "occupied" && u.has_overdue) return "overdue";
  if (u.status === "occupied" && u.is_expiring) return "expiring";
  return u.status;
}

/** ว่าง = เขียว · มีผู้เช่า = ดำ · ใกล้หมดสัญญา = เหลือง · ค้างชำระ = แดง · ปิดปรับปรุง = เทา */
export const TILE_CLASS: Record<TileState, string> = {
  available: "border-ok bg-ok-soft text-ok",
  occupied: "border-ink bg-ink text-white",
  expiring: "border-brand-strong bg-brand text-ink",
  overdue: "border-bad bg-bad text-white",
  maintenance: "border-muted/40 bg-line text-muted",
  inactive: "border-dashed border-line bg-surface text-muted/60",
};

export const TILE_LEGEND: { state: TileState; label: string }[] = [
  { state: "available", label: "ว่าง" },
  { state: "occupied", label: "มีผู้เช่า" },
  { state: "expiring", label: "ใกล้หมดสัญญา" },
  { state: "overdue", label: "ค้างชำระเกินกำหนด" },
  { state: "maintenance", label: "ปิดปรับปรุง" },
];

export const TILE_LABEL: Record<TileState, string> = {
  available: "ว่าง",
  occupied: "มีผู้เช่า",
  expiring: "ใกล้หมดสัญญา",
  overdue: "ค้างชำระเกินกำหนด",
  maintenance: "ปิดปรับปรุง",
  inactive: "ปิดใช้งาน",
};

/** สีที่เลือกได้บนผัง (ใช้ inline style เพื่อให้สีตรงทุกหน้าจอ) */
export const PLAN_COLORS: { key: PlanColor; label: string; fill: string; border: string; text: string }[] = [
  { key: "yellow", label: "เหลือง", fill: "#ffd21f", border: "#e0b400", text: "#111111" },
  { key: "orange", label: "ส้ม", fill: "#fdba74", border: "#f97316", text: "#111111" },
  { key: "red", label: "แดง", fill: "#fca5a5", border: "#ef4444", text: "#111111" },
  { key: "pink", label: "ชมพู", fill: "#f9a8d4", border: "#ec4899", text: "#111111" },
  { key: "purple", label: "ม่วง", fill: "#c4b5fd", border: "#8b5cf6", text: "#111111" },
  { key: "blue", label: "ฟ้า", fill: "#93c5fd", border: "#3b82f6", text: "#111111" },
  { key: "teal", label: "เขียวมิ้นต์", fill: "#99f6e4", border: "#14b8a6", text: "#111111" },
  { key: "green", label: "เขียว", fill: "#86efac", border: "#22c55e", text: "#111111" },
  { key: "gray", label: "เทา", fill: "#e5e7eb", border: "#9ca3af", text: "#374151" },
  { key: "black", label: "ดำ", fill: "#1f1f1f", border: "#000000", text: "#ffffff" },
  { key: "white", label: "ขาว", fill: "#ffffff", border: "#cfcfcf", text: "#111111" },
  { key: "none", label: "ไม่มีพื้น (ตัวหนังสืออย่างเดียว)", fill: "transparent", border: "transparent", text: "#111111" },
];

export function colorStyle(key: PlanColor | null | undefined) {
  const c = PLAN_COLORS.find((x) => x.key === key) ?? PLAN_COLORS[0];
  return { background: c.fill, borderColor: c.border, color: c.text };
}

/** สีตั้งต้นของห้องที่ยังไม่ได้เลือกสี (ตามประเภท) */
export function defaultUnitColor(typeCode: string): PlanColor {
  return ({ XS: "orange", S: "yellow", M: "blue", L: "green", PARKING: "gray" } as Record<string, PlanColor>)[typeCode] ?? "yellow";
}

export function gridBackground(cell: number) {
  return {
    backgroundImage:
      "linear-gradient(to right, rgb(0 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.06) 1px, transparent 1px)",
    backgroundSize: `${cell}px ${cell}px`,
  };
}
