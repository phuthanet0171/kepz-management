import type { PlanUnit } from "@/lib/types";

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

export function tileState(u: PlanUnit): TileState {
  if (u.status === "occupied" && u.has_overdue) return "overdue";
  if (u.status === "occupied" && u.is_expiring) return "expiring";
  return u.status;
}

export const TILE_CLASS: Record<TileState, string> = {
  available: "border-ok bg-ok-soft text-ok",
  occupied: "border-ink bg-ink text-white",
  expiring: "border-brand-strong bg-brand text-ink",
  overdue: "border-bad bg-bad text-white",
  maintenance:
    "border-line text-muted bg-[repeating-linear-gradient(135deg,var(--color-canvas)_0_6px,var(--color-line)_6px_8px)]",
  inactive: "border-dashed border-line bg-surface text-muted/60",
};

export const TILE_LEGEND: { state: TileState; label: string }[] = [
  { state: "available", label: "ว่าง" },
  { state: "occupied", label: "มีผู้เช่า" },
  { state: "expiring", label: "ใกล้หมดสัญญา" },
  { state: "overdue", label: "ค้างชำระเกินกำหนด" },
  { state: "maintenance", label: "ปิดปรับปรุง" },
];

export function gridBackground(cell: number) {
  return {
    backgroundImage:
      "linear-gradient(to right, rgb(0 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(0 0 0 / 0.06) 1px, transparent 1px)",
    backgroundSize: `${cell}px ${cell}px`,
  };
}
