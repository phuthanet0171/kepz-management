import type { PlanColor, PlanShape, PlanUnit } from "@/lib/types";

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

/** สีของสัญลักษณ์บนผัง (ไม่ใช่ห้องเช่า) */
export const OBJECT_COLORS: { key: PlanColor; label: string; cls: string; swatch: string }[] = [
  { key: "gray", label: "เทา", cls: "border-[#9ca3af] bg-[#e5e7eb] text-[#374151]", swatch: "#d1d5db" },
  { key: "yellow", label: "เหลือง", cls: "border-brand-strong bg-brand-soft text-ink", swatch: "#ffd21f" },
  { key: "black", label: "ดำ", cls: "border-ink bg-ink text-white", swatch: "#111111" },
  { key: "blue", label: "ฟ้า", cls: "border-info/50 bg-info-soft text-info", swatch: "#60a5fa" },
  { key: "green", label: "เขียว", cls: "border-ok/50 bg-ok-soft text-ok", swatch: "#4ade80" },
  { key: "red", label: "แดง", cls: "border-bad/50 bg-bad-soft text-bad", swatch: "#f87171" },
  { key: "orange", label: "ส้ม", cls: "border-[#f59e0b] bg-[#fef3c7] text-[#92400e]", swatch: "#fb923c" },
  { key: "none", label: "ไม่มีพื้น (ข้อความ)", cls: "border-transparent bg-transparent text-ink", swatch: "transparent" },
];

export function objectClass(color: PlanColor) {
  return (OBJECT_COLORS.find((c) => c.key === color) ?? OBJECT_COLORS[0]).cls;
}

/** สัญลักษณ์สำเร็จรูป กดแล้ววางพร้อมชื่อและสี */
export const OBJECT_PRESETS: { label: string; color: PlanColor; shape: PlanShape; w: number; h: number }[] = [
  { label: "ทางเข้า", color: "green", shape: "rect", w: 4, h: 2 },
  { label: "ลิฟต์", color: "blue", shape: "rect", w: 3, h: 3 },
  { label: "บันได", color: "gray", shape: "rect", w: 3, h: 4 },
  { label: "ห้องน้ำ", color: "blue", shape: "rect", w: 3, h: 3 },
  { label: "เคาน์เตอร์", color: "yellow", shape: "rect", w: 5, h: 2 },
  { label: "เสา", color: "black", shape: "circle", w: 1, h: 1 },
  { label: "ทางเดิน", color: "gray", shape: "rect", w: 10, h: 2 },
  { label: "ป้ายโซน", color: "none", shape: "rect", w: 6, h: 2 },
];

export function gridBackground(cell: number) {
  return {
    backgroundImage:
      "linear-gradient(to right, rgb(0 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.06) 1px, transparent 1px)",
    backgroundSize: `${cell}px ${cell}px`,
  };
}
