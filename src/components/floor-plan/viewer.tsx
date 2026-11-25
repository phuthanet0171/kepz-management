"use client";

import clsx from "clsx";
import { BadgeCheck, ChevronRight, FileSignature, Maximize2, Minus, Palette, Plus, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { baht, thDate } from "@/lib/format";
import type { FloorPlan, Placement, PlanObject, PlanUnit } from "@/lib/types";
import { usePinchZoom, ZoomBar } from "./zoom-controls";
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

export function FloorPlanLegend({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted", className)}>
      {TILE_LEGEND.map((l) => (
        <Fragment key={l.state}>
          {/* รอชำระ อยู่ก่อน ค้างชำระเกินกำหนด */}
          {l.state === "overdue" && (
            <span className="inline-flex items-center gap-1.5">
              <PendingBadge size={14} /> รอชำระ
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
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
        </Fragment>
      ))}
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
      style={{ width: size, height: size, fontSize: size * 0.7 }}
    >
      !
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
  // แบบที่เลือกล่าสุดถูกจำไว้ในเครื่องนี้ (ครั้งแรก = ผังปกติ)
  const mode = useSyncExternalStore(subscribeMode, readMode, () => "plan" as ViewMode);
  const [zoom, setZoom] = useState(1);
  const fitted = useRef<string | null>(null);
  // มือถือ: แตะห้องแล้วแสดงข้อมูลย่อจากด้านล่าง (ไม่ต้องออกจากผัง)
  const [picked, setPicked] = useState<string | null>(null);
  const pickedUnit = picked ? units.get(picked) : undefined;

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

  usePinchZoom(wrapRef, zoom, setZoom, { min: 0.3, max: 3 });

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
              ["plan", "ผังปกติ", Palette],
              ["status", "ดูสถานะเช่า", BadgeCheck],
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
        <div className="ml-auto flex items-center gap-1 max-lg:hidden">
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
      <div className="no-scrollbar mb-2 max-lg:-mx-2 max-lg:overflow-x-auto max-lg:px-2">
        {mode === "status" ? (
          <FloorPlanLegend className="max-lg:flex-nowrap max-lg:whitespace-nowrap" />
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap text-muted max-lg:flex-nowrap">
            <span className="max-lg:hidden">แสดงสีตามที่จัดผังไว้ · แตะห้องเพื่อดูรายละเอียด</span>
            <span className="inline-flex items-center gap-1.5">
              <PendingBadge size={14} /> รอชำระ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <OverdueBadge size={14} /> ค้างชำระเกินกำหนด
            </span>
          </p>
        )}
      </div>
      <div className="relative">
        <div
          ref={wrapRef}
          className="overflow-auto rounded-xl border border-line bg-surface max-lg:max-h-[calc(100dvh-17rem)]"
          style={{ touchAction: "pan-x pan-y" }}
        >
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
                  onClick={(e) => {
                    // มือถือ: แสดงข้อมูลย่อก่อน กดปุ่มในแผงเพื่อไปหน้าห้อง
                    if (window.innerWidth >= 1024) return;
                    e.preventDefault();
                    setPicked(u.id);
                  }}
                  title={`${u.code} · ${u.tenant_name ?? TILE_LABEL[state]}${state === "overdue" ? " · ค้างชำระเกินกำหนด" : u.has_unpaid ? " · รอชำระ" : ""}`}
                  className={clsx(
                    "absolute flex flex-col items-center justify-center border-2 text-center leading-snug transition hover:z-10 hover:brightness-95 active:scale-[0.97]",
                    p.shape === "circle" ? "rounded-full" : "rounded-md",
                    mode === "status" && TILE_CLASS[state],
                    // รอชำระ: กรอบส้มรอบกล่องตามรูปทรง
                    state !== "overdue" && u.has_unpaid && u.status === "occupied" && "ring-[3px] ring-[#f97316] ring-offset-1",
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
      {/* มือถือ: ซูมอยู่ใต้ผัง ไม่ลอยทับห้อง · ใช้สองนิ้วซูมได้ */}
      <ZoomBar
        className="mt-2 lg:hidden"
        zoom={zoom}
        hint="แตะห้องดูข้อมูล · 2 นิ้วซูม"
        onIn={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}
        onOut={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}
        onFit={fit}
      />

      {pickedUnit && <UnitQuickSheet unit={pickedUnit} onClose={() => setPicked(null)} />}
    </div>
  );
}

/** มือถือ: ข้อมูลย่อของห้องที่แตะบนผัง */
function UnitQuickSheet({ unit: u, onClose }: { unit: PlanUnit; onClose: () => void }) {
  const state = tileState(u);
  const pending = state !== "overdue" && u.has_unpaid && u.status === "occupied";
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-50 bg-ink/30 lg:hidden" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`ห้อง ${u.code}`}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t-2 border-brand bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgb(0_0_0/0.25)] lg:hidden"
      >
        <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-line" />
        <div className="flex items-start justify-between gap-3 px-5 pt-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold tracking-tight">{u.code}</div>
            <div className="text-sm text-muted">{u.unit_type_name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost -mr-2 size-10 min-h-0 rounded-full p-0"
            aria-label="ปิด"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 px-5">
          <span
            className={clsx(
              "inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold",
              TILE_CLASS[state],
            )}
          >
            {TILE_LABEL[state]}
          </span>
          {pending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ffedd5] px-2.5 py-0.5 text-xs font-semibold text-[#c2410c]">
              <PendingBadge size={14} /> รอชำระ
            </span>
          )}
        </div>
        {u.tenant_name && (
          <dl className="mx-5 mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl bg-canvas px-3.5 py-3">
            <div className="col-span-2">
              <dt className="text-xs text-muted">ผู้เช่า</dt>
              <dd className="font-semibold">{u.tenant_name}</dd>
            </div>
            {u.contract_rent != null && (
              <div>
                <dt className="text-xs text-muted">ค่าเช่า/เดือน</dt>
                <dd className="tabular font-semibold">{baht(u.contract_rent)}</dd>
              </div>
            )}
            {u.contract_end_date && (
              <div>
                <dt className="text-xs text-muted">สัญญาสิ้นสุด</dt>
                <dd className={clsx("font-semibold", u.is_expiring && "text-warn")}>{thDate(u.contract_end_date)}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="grid gap-2 p-5">
          {u.status === "available" && (
            <Link href={`/contracts/new?unit=${u.id}`} className="btn btn-brand w-full">
              <FileSignature className="size-4" /> ทำสัญญาเช่าห้องนี้
            </Link>
          )}
          <Link href={`/units/${u.id}`} className={clsx("btn w-full", u.status === "available" ? "btn-outline" : "btn-primary")}>
            {state === "overdue" || pending ? "ดูห้องและรับชำระ" : "ดูรายละเอียดห้อง"} <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
