"use client";

import clsx from "clsx";
import { Maximize2, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FloorPlan, Placement, PlanUnit } from "@/lib/types";
import { BASE_CELL, gridBackground, TILE_CLASS, TILE_LEGEND, tileState } from "./shared";

export function FloorPlanLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {TILE_LEGEND.map((l) => (
        <span key={l.state} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-3 rounded border-2", TILE_CLASS[l.state])} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

/** ผังสถานที่แบบดูอย่างเดียว แตะห้องเพื่อเปิดรายละเอียด */
export function FloorPlanViewer({
  plan,
  placements,
  units,
}: {
  plan: FloorPlan;
  placements: Placement[];
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
          {placements.map((p) => {
            const u = units.get(p.unit_id);
            if (!u) return null;
            const state = tileState(u);
            const small = Math.min(p.w, p.h) * cell < 44;
            return (
              <Link
                key={p.unit_id}
                href={`/units/${u.id}`}
                title={`${u.code} · ${u.tenant_name ?? TILE_LEGEND.find((l) => l.state === state)?.label ?? ""}`}
                className={clsx(
                  "absolute flex flex-col items-center justify-center overflow-hidden rounded-md border-2 text-center leading-tight transition hover:z-10 hover:brightness-95 active:scale-[0.97]",
                  TILE_CLASS[state],
                )}
                style={{ left: p.x * cell + 1, top: p.y * cell + 1, width: p.w * cell - 2, height: p.h * cell - 2 }}
              >
                <span className="font-bold" style={{ fontSize: Math.max(9, Math.min(16, cell * 0.55)) }}>
                  {u.code}
                </span>
                {!small && u.tenant_name && (
                  <span className="w-full truncate px-1" style={{ fontSize: Math.max(8, Math.min(12, cell * 0.4)) }}>
                    {u.tenant_name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
