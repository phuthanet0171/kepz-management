"use client";

import clsx from "clsx";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";

/**
 * ซูมสองนิ้ว (pinch) บนพื้นที่ผัง: จุดกึ่งกลางระหว่างนิ้วอยู่ที่เดิมขณะซูม
 * เลื่อนผังด้วยนิ้วเดียวบนพื้นที่ว่างได้ตามปกติ (scroll ของกล่อง)
 */
export function usePinchZoom(
  ref: RefObject<HTMLElement | null>,
  zoom: number,
  setZoom: (z: number) => void,
  { min, max, onPinchStart }: { min: number; max: number; onPinchStart?: () => void },
) {
  const zoomRef = useRef(zoom);
  const startRef = useRef(onPinchStart);
  useEffect(() => {
    zoomRef.current = zoom;
    startRef.current = onPinchStart;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { d: number; z: number; mx: number; my: number; cx: number; cy: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      startRef.current?.();
      const r = el.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      // ตำแหน่งบนผัง (หน่วยที่ซูม 1) ใต้จุดกึ่งกลางนิ้ว
      start = { d: dist(e.touches), z: zoomRef.current, mx, my, cx: (el.scrollLeft + mx) / zoomRef.current, cy: (el.scrollTop + my) / zoomRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const z = Math.round(Math.min(max, Math.max(min, (start.z * dist(e.touches)) / start.d)) * 100) / 100;
      if (z === zoomRef.current) return;
      zoomRef.current = z;
      setZoom(z);
      const s = start;
      // หลังวาดขนาดใหม่ เลื่อนให้จุดใต้นิ้วอยู่ที่เดิม
      requestAnimationFrame(() => {
        el.scrollLeft = s.cx * z - s.mx;
        el.scrollTop = s.cy * z - s.my;
      });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, setZoom, min, max]);
}

/** แถบซูมเล็กใต้ผัง (มือถือ) ไม่ลอยทับห้อง */
export function ZoomBar({
  zoom,
  onIn,
  onOut,
  onFit,
  hint,
  className,
}: {
  zoom: number;
  onIn: () => void;
  onOut: () => void;
  onFit: () => void;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <p className="min-w-0 flex-1 truncate text-xs text-muted">{hint}</p>
      <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-line bg-surface">
        <button type="button" className="grid size-9 place-items-center active:bg-canvas" aria-label="ย่อ" onClick={onOut}>
          <Minus className="size-4" />
        </button>
        <span className="tabular w-11 text-center text-xs font-medium text-ink-2">{Math.round(zoom * 100)}%</span>
        <button type="button" className="grid size-9 place-items-center active:bg-canvas" aria-label="ขยาย" onClick={onIn}>
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="flex h-9 items-center gap-1 border-l border-line px-3 text-xs font-medium active:bg-canvas"
          onClick={onFit}
        >
          <Maximize2 className="size-3.5" /> พอดีจอ
        </button>
      </div>
    </div>
  );
}
