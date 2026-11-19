"use client";

import clsx from "clsx";
import { Activity, Maximize2, Minus, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FloorPlan, Placement, PlanObject, PlanUnit } from "@/lib/types";
import {
  BASE_CELL,
  colorStyle,
  defaultUnitColor,
  gridBackground,
  TILE_CLASS,
  labelStyle,
  TILE_LABEL,
  TILE_LEGEND,
  tileState,
} from "./shared";

type ViewMode = "plan" | "status";
const MODE_KEY = "kepz-plan-view";
const modeListeners = new Set<() => void>();
function readMode(): ViewMode {
  try {
    return localStorage.getItem(MODE_KEY) === "status" ? "status" : "plan";
  } catch {
    return "plan";
  }
}
function writeMode(m: ViewMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
  modeListeners.forEach((l) => l());
}
function subscribeMode(cb: () => void) {
  modeListeners.add(cb);
  return () => modeListeners.delete(cb);
}

export function FloorPlanLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {TILE_LEGEND.map((l) => (
        <span key={l.state} className="inline-flex items-center gap-1.5">
          <span
            className={clsx(
              "flex size-3.5 items-center justify-center rounded border-2 text-[10px] leading-none font-black",
              TILE_CLASS[l.state],
            )}
          >
            {l.state === "overdue" && "!"}
          </span>
          {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <PendingBadge size={14} /> รอชำระ
      </span>
    </div>
  );
}

/** ป้าย ! สีแดง มุมขวาบนของห้องที่มีบิลค้างชำระเกินกำหนด */
export function OverdueBadge({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-label="ค้างชำระเกินกำหนด"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-bad leading-none font-black text-white ring-2 ring-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.7 }}
    >
      !
    </span>
  );
}

/** ป้ายสีส้ม มุมขวาบนของห้องที่มีบิลรอชำระ (ยังไม่เลยกำหนด) */
export function PendingBadge({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-label="รอชำระ"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#f97316] leading-none font-black text-white ring-2 ring-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
    >
      ฿
    </span>
  );
}

/** สัญลักษณ์บนผัง (ทางเข้า ลิฟต์ เสา ป้ายโซน) ดูอย่างเดียว */
export function PlanObjectBox({
  o,
  cell,
}: {
  o: Pick<PlanObject, "label" | "shape" | "color" | "x" | "y" | "w" | "h">;
  cell: number;
}) {
  return (
    <div
      className={clsx(
        "absolute flex items-center justify-center overflow-hidden border-2 text-center leading-tight font-semibold",
        o.shape === "circle" ? "rounded-full" : "rounded-md",
      )}
      style={{
        ...colorStyle(o.color),
        left: o.x * cell + 1,
        top: o.y * cell + 1,
        width: o.w * cell - 2,
        height: o.h * cell - 2,
        fontSize: Math.max(8, Math.min(o.color === "none" ? 20 : 13, cell * (o.color === "none" ? 0.7 : 0.5))),
      }}
    >
      <span className="px-0.5">{o.label}</span>
    </div>
  );
}

/** ผังสถานที่แบบดูอย่างเดียว แตะห้องเพื่อเปิดรายละเอียด */
export function FloorPlanViewer({
  plan,
  placements,
  objects = [],
  units,
}: {
  plan: FloorPlan;
  placements: Placement[];
  objects?: PlanObject[];
  units: Map<string, PlanUnit>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // แบบที่เลือกล่าสุดถูกจำไว้ในเครื่องนี้ (ครั้งแรก = สีตามผัง)
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "plan" as ViewMode);
  const [zoom, setZoom] = useState(1);
  const fitted = useRef<string | null>(null);

  // แสดงเฉพาะส่วนที่มีห้อง/สัญลักษณ์ (ตัดพื้นที่ว่างรอบนอก) เผื่อขอบ 1 ช่อง ห้องจะใหญ่ อ่านง่ายบนมือถือ
  const boxes = [...placements, ...objects];
  const offX = boxes.length ? Math.max(0, Math.min(...boxes.map((b) => b.x)) - 1) : 0;
  const offY = boxes.length ? Math.max(0, Math.min(...boxes.map((b) => b.y)) - 1) : 0;
  const viewCols = boxes.length ? Math.min(plan.cols, Math.max(...boxes.map((b) => b.x + b.w)) + 1) - offX : plan.cols;
  const viewRows = boxes.length ? Math.min(plan.rows, Math.max(...boxes.map((b) => b.y + b.h)) + 1) - offY : plan.rows;

  const fit = () => {
    const el = wrapRef.current;
    if (!el) return;
    // ซูมพอดีจอแต่ไม่เกิน 125% (จอใหญ่ห้องไม่ใหญ่เกินไป)
    const z = Math.min(1.25, Math.max(0.3, (el.clientWidth - 2) / (viewCols * BASE_CELL)));
    setZoom(Math.round(z * 100) / 100);
  };

  // ครั้งแรกที่เปิดผังแต่ละแผ่น ให้ย่อ/ขยายพอดีความกว้างจอ
  useLayoutEffect(() => {
    if (fitted.current === plan.id) return;
    fitted.current = plan.id;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("orientationchange", onResize);
    return () => window.removeEventListener("orientationchange", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.cols]);

  const cell = BASE_CELL * zoom;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div
          className="grid grid-cols-2 rounded-xl bg-line/50 p-1 max-sm:w-full sm:inline-grid"
          role="tablist"
          aria-label="แบบการแสดงผัง"
        >
          {(
            [
              ["plan", "สีตามผัง", Palette],
              ["status", "สถานะห้อง", Activity],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => writeMode(m)}
              className={clsx(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                mode === m ? "bg-ink text-white shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn btn-outline btn-sm size-9 p-0"
            aria-label="ย่อ"
            onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}
          >
            <Minus className="size-4" />
          </button>
          <span className="tabular w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="btn btn-outline btn-sm size-9 p-0"
            aria-label="ขยาย"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}
          >
            <Plus className="size-4" />
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={fit}>
            <Maximize2 className="size-3.5" /> พอดีจอ
          </button>
        </div>
      </div>
      <div className="mb-2">
        {mode === "status" ? (
          <FloorPlanLegend />
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>แสดงสีตามที่จัดผังไว้ · แตะห้องเพื่อดูรายละเอียด</span>
            <span className="inline-flex items-center gap-1.5">
              <OverdueBadge size={14} /> ค้างชำระเกินกำหนด
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PendingBadge size={14} /> รอชำระ
            </span>
          </p>
        )}
      </div>
      <div ref={wrapRef} className="overflow-auto rounded-xl border border-line bg-surface">
        <div className="relative" style={{ width: viewCols * cell, height: viewRows * cell, ...gridBackground(cell) }}>
          {objects.map((o) => (
            <PlanObjectBox key={o.id} o={{ ...o, x: o.x - offX, y: o.y - offY }} cell={cell} />
          ))}
          {placements.map((p) => {
            const u = units.get(p.unit_id);
            if (!u) return null;
            const state = tileState(u);
            const small = Math.min(p.w, p.h) * cell < 44;
            return (
              <Link
                key={p.unit_id}
                href={`/units/${u.id}`}
                title={`${u.code} · ${u.tenant_name ?? TILE_LABEL[state]}${state === "overdue" ? " · ค้างชำระเกินกำหนด" : u.has_unpaid ? " · รอชำระ" : ""}`}
                className={clsx(
                  "absolute flex flex-col items-center justify-center border-2 text-center leading-snug transition hover:z-10 hover:brightness-95 active:scale-[0.97]",
                  p.shape === "circle" ? "rounded-full" : "rounded-md",
                  mode === "status" && TILE_CLASS[state],
                )}
                style={{
                  left: (p.x - offX) * cell + 1,
                  top: (p.y - offY) * cell + 1,
                  width: p.w * cell - 2,
                  height: p.h * cell - 2,
                  ...(mode === "plan" ? colorStyle(p.color ?? defaultUnitColor(u.unit_type_code)) : {}),
                }}
              >
                <span
                  className="max-w-full px-0.5 font-bold"
                  style={labelStyle(
                    Math.max(9, Math.min(16, cell * 0.55)),
                    p.h * cell - 2,
                    !small && u.tenant_name ? Math.max(8, Math.min(12, cell * 0.4)) * 1.4 : 0,
                  )}
                >
                  {u.code}
                </span>
                {!small && u.tenant_name && (
                  <span className="w-full truncate px-1" style={{ fontSize: Math.max(8, Math.min(12, cell * 0.4)) }}>
                    {u.tenant_name}
                  </span>
                )}
                {state !== "overdue" && u.has_unpaid && u.status === "occupied" && (
                  <PendingBadge
                    size={Math.max(14, Math.min(22, cell * 0.8))}
                    className={clsx("absolute", p.shape === "circle" ? "top-[8%] right-[8%]" : "-top-1.5 -right-1.5")}
                  />
                )}
                {state === "overdue" && (
                  <OverdueBadge
                    size={Math.max(14, Math.min(22, cell * 0.8))}
                    className={clsx("absolute", p.shape === "circle" ? "top-[8%] right-[8%]" : "-top-1.5 -right-1.5")}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
