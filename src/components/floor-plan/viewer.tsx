"use client";

import clsx from "clsx";
import { Maximize2, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FloorPlan, Placement, PlanObject, PlanUnit } from "@/lib/types";
import { BASE_CELL, gridBackground, objectClass, TILE_CLASS, TILE_LABEL, TILE_LEGEND, tileState } from "./shared";

export function FloorPlanLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {TILE_LEGEND.map((l) => (
        <span key={l.state} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-3 rounded border-2", TILE_CLASS[l.state])} />
          {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <OverdueBadge size={14} />
        ค้างชำระเกินกำหนด
      </span>
    </div>
  );
}

/** ป้าย ! สีแดง มุมขวาบนของห้องที่มีบิลค้างชำระเกินกำหนด */
export function OverdueBadge({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-label="ค้างชำระเกินกำหนด"
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-bad leading-none font-black text-white ring-2 ring-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.7 }}
    >
      !
    </span>
  );
}

/** สัญลักษณ์บนผัง (ทางเข้า ลิฟต์ เสา ป้ายโซน) ดูอย่างเดียว */
export function PlanObjectBox({ o, cell }: { o: Pick<PlanObject, "label" | "shape" | "color" | "x" | "y" | "w" | "h">; cell: number }) {
  return (
    <div
      className={clsx(
        "absolute flex items-center justify-center overflow-hidden border-2 text-center leading-tight font-semibold",
        o.shape === "circle" ? "rounded-full" : "rounded-md",
        objectClass(o.color),
      )}
      style={{
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
  const [zoom, setZoom] = useState(1);
  const fitted = useRef<string | null>(null);

  const fit = () => {
    const el = wrapRef.current;
    if (!el) return;
    const z = Math.min(2, Math.max(0.3, (el.clientWidth - 2) / (plan.cols * BASE_CELL)));
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
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" className="btn btn-outline btn-sm size-9 p-0" aria-label="ย่อ" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}>
          <Minus className="size-4" />
        </button>
        <span className="tabular w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-outline btn-sm size-9 p-0" aria-label="ขยาย" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}>
          <Plus className="size-4" />
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={fit}>
          <Maximize2 className="size-3.5" /> พอดีจอ
        </button>
      </div>
      <div ref={wrapRef} className="overflow-auto rounded-xl border border-line bg-surface">
        <div className="relative" style={{ width: plan.cols * cell, height: plan.rows * cell, ...gridBackground(cell) }}>
          {objects.map((o) => (
            <PlanObjectBox key={o.id} o={o} cell={cell} />
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
                title={`${u.code} · ${u.tenant_name ?? TILE_LABEL[state]}${u.has_overdue ? " · ค้างชำระเกินกำหนด" : ""}`}
                className={clsx(
                  "absolute flex flex-col items-center justify-center border-2 text-center leading-snug transition hover:z-10 hover:brightness-95 active:scale-[0.97]",
                  p.shape === "circle" ? "rounded-full" : "rounded-md",
                  TILE_CLASS[state],
                )}
                style={{ left: p.x * cell + 1, top: p.y * cell + 1, width: p.w * cell - 2, height: p.h * cell - 2 }}
              >
                <span className="max-w-full truncate px-0.5 font-bold" style={{ fontSize: Math.max(9, Math.min(16, cell * 0.55)) }}>
                  {u.code}
                </span>
                {!small && u.tenant_name && (
                  <span className="w-full truncate px-1" style={{ fontSize: Math.max(8, Math.min(12, cell * 0.4)) }}>
                    {u.tenant_name}
                  </span>
                )}
                {u.has_overdue && (
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
