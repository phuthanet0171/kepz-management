"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  LayoutGrid,
  Minus,
  MousePointerClick,
  Plus,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BASE_CELL, defaultBox, findFreeSpot, gridBackground, overlaps, type Rect } from "@/components/floor-plan/shared";
import type { FloorPlan, Placement, PlanUnit } from "@/lib/types";
import { saveFloorPlan } from "./actions";

type Boxes = Record<string, Rect>;

type Drag =
  | { kind: "move" | "resize"; id: string; startX: number; startY: number; orig: Rect; moved: boolean }
  | { kind: "new"; id: string; w: number; h: number; clientX: number; clientY: number; startX: number; startY: number; moved: boolean };

export function FloorPlanEditor({
  plan,
  placements,
  units,
  placedElsewhere,
}: {
  plan: FloorPlan;
  placements: Placement[];
  units: PlanUnit[];
  /** unit_id → ชื่อผังอื่นที่ห้องนี้ถูกวางไว้ */
  placedElsewhere: Record<string, string>;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const b: Boxes = {};
    for (const p of placements) b[p.unit_id] = { x: p.x, y: p.y, w: p.w, h: p.h };
    return b;
  }, [placements]);

  const [boxes, setBoxes] = useState<Boxes>(initial);
  const [name, setName] = useState(plan.name);
  const [cols, setCols] = useState(plan.cols);
  const [rows, setRows] = useState(plan.rows);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // ห้องจากแถบข้างที่รอแตะตำแหน่งวาง
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);

  const cell = BASE_CELL * zoom;
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const dirty = useMemo(() => {
    if (name !== plan.name || cols !== plan.cols || rows !== plan.rows) return true;
    const a = Object.keys(boxes);
    if (a.length !== Object.keys(initial).length) return true;
    return a.some((id) => {
      const o = initial[id];
      const n = boxes[id];
      return !o || o.x !== n.x || o.y !== n.y || o.w !== n.w || o.h !== n.h;
    });
  }, [boxes, initial, name, cols, rows, plan]);

  // เตือนก่อนออกจากหน้าถ้ายังไม่บันทึก
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const overlapping = useMemo(() => {
    const ids = Object.keys(boxes);
    const bad = new Set<string>();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if (overlaps(boxes[ids[i]], boxes[ids[j]])) {
          bad.add(ids[i]);
          bad.add(ids[j]);
        }
    return bad;
  }, [boxes]);

  const outOfBounds = useMemo(
    () => new Set(Object.entries(boxes).filter(([, b]) => b.x + b.w > cols || b.y + b.h > rows).map(([id]) => id)),
    [boxes, cols, rows],
  );

  const collator = useMemo(() => new Intl.Collator("th", { numeric: true }), []);
  const unplaced = useMemo(
    () =>
      units
        .filter((u) => !boxes[u.id] && !placedElsewhere[u.id] && u.status !== "inactive")
        .sort((a, b) => a.type_sort - b.type_sort || collator.compare(a.code, b.code)),
    [units, boxes, placedElsewhere, collator],
  );
  const elsewhere = units.filter((u) => !boxes[u.id] && placedElsewhere[u.id]);

  const unplacedGroups = useMemo(() => {
    const m = new Map<string, { name: string; units: PlanUnit[] }>();
    for (const u of unplaced) {
      const g = m.get(u.unit_type_code) ?? { name: u.unit_type_name, units: [] };
      g.units.push(u);
      m.set(u.unit_type_code, g);
    }
    return [...m.values()];
  }, [unplaced]);

  const cellFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return { cx: (clientX - r.left) / cell, cy: (clientY - r.top) / cell, inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom };
    },
    [cell],
  );

  const placeAt = useCallback(
    (id: string, cx: number, cy: number) => {
      const u = unitById.get(id);
      if (!u) return;
      const { w, h } = defaultBox(u.unit_type_code);
      const x = Math.max(0, Math.min(cols - w, Math.round(cx - w / 2)));
      const y = Math.max(0, Math.min(rows - h, Math.round(cy - h / 2)));
      setBoxes((b) => ({ ...b, [id]: { x, y, w, h } }));
      setSelected(id);
      setPending(null);
    },
    [unitById, cols, rows],
  );

  // จัดการลาก (ย้าย / ปรับขนาด / ลากห้องใหม่จากแถบข้าง) ด้วย pointer events รองรับทั้งเมาส์และนิ้วบนแท็บเล็ต
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const moved = drag.moved || Math.abs(dxPx) > 4 || Math.abs(dyPx) > 4;
      if (drag.kind === "new") {
        setDrag({ ...drag, clientX: e.clientX, clientY: e.clientY, moved });
        return;
      }
      const dx = Math.round(dxPx / cell);
      const dy = Math.round(dyPx / cell);
      const o = drag.orig;
      setBoxes((b) => {
        const next =
          drag.kind === "move"
            ? { ...o, x: Math.max(0, Math.min(cols - o.w, o.x + dx)), y: Math.max(0, Math.min(rows - o.h, o.y + dy)) }
            : { ...o, w: Math.max(1, Math.min(cols - o.x, o.w + dx)), h: Math.max(1, Math.min(rows - o.y, o.h + dy)) };
        const cur = b[drag.id];
        if (cur && cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h) return b;
        return { ...b, [drag.id]: next };
      });
      if (moved !== drag.moved) setDrag({ ...drag, moved });
    };
    const onUp = (e: PointerEvent) => {
      if (drag.kind === "new") {
        const { cx, cy, inside } = cellFromClient(e.clientX, e.clientY);
        if (drag.moved && inside) placeAt(drag.id, cx, cy);
        else if (!drag.moved) setPending((p) => (p === drag.id ? null : drag.id)); // แตะ = เลือกไว้ก่อน แล้วแตะตำแหน่งบนผัง
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, cell, cols, rows, cellFromClient, placeAt]);

  // แป้นพิมพ์: ลูกศรขยับ, Delete นำออก, R หมุน
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const step = e.shiftKey ? 5 : 1;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[e.key]) {
        e.preventDefault();
        setBoxes((b) => {
          const o = b[selected];
          if (!o) return b;
          return {
            ...b,
            [selected]: {
              ...o,
              x: Math.max(0, Math.min(cols - o.w, o.x + mv[e.key][0])),
              y: Math.max(0, Math.min(rows - o.h, o.y + mv[e.key][1])),
            },
          };
        });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "r" || e.key === "R") {
        rotateSelected();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function rotateSelected() {
    if (!selected) return;
    setBoxes((b) => {
      const o = b[selected];
      if (!o) return b;
      const w = Math.min(o.h, cols);
      const h = Math.min(o.w, rows);
      return { ...b, [selected]: { x: Math.min(o.x, cols - w), y: Math.min(o.y, rows - h), w, h } };
    });
  }

  function removeSelected() {
    if (!selected) return;
    setBoxes((b) => {
      const n = { ...b };
      delete n[selected];
      return n;
    });
    setSelected(null);
  }

  function setSelectedSize(w: number, h: number) {
    if (!selected) return;
    setBoxes((b) => {
      const o = b[selected];
      if (!o) return b;
      const nw = Math.max(1, Math.min(100, cols - o.x, w || 1));
      const nh = Math.max(1, Math.min(100, rows - o.y, h || 1));
      return { ...b, [selected]: { ...o, w: nw, h: nh } };
    });
  }

  function autoArrange() {
    const rects = Object.values(boxes);
    const added: Boxes = {};
    let lastType = "";
    let cursor = { x: 0, y: 0 };
    for (const u of unplaced) {
      const { w, h } = defaultBox(u.unit_type_code);
      // เริ่มแถวใหม่เมื่อเปลี่ยนประเภทห้อง เพื่อให้ห้องประเภทเดียวกันอยู่ใกล้กัน
      if (u.unit_type_code !== lastType) {
        const bottom = Math.max(0, ...[...rects, ...Object.values(added)].map((r) => r.y + r.h));
        cursor = { x: 0, y: lastType ? Math.min(bottom + 1, rows - 1) : 0 };
        lastType = u.unit_type_code;
      }
      const spot = findFreeSpot([...rects, ...Object.values(added)], w, h, cols, rows, cursor) ?? findFreeSpot([...rects, ...Object.values(added)], w, h, cols, rows);
      if (!spot) {
        setMessage({ tone: "bad", text: "พื้นที่ผังไม่พอ ขยายขนาดผังก่อน แล้วลองจัดอัตโนมัติอีกครั้ง" });
        break;
      }
      added[u.id] = spot;
      cursor = { x: spot.x + spot.w, y: spot.y };
    }
    setBoxes((b) => ({ ...b, ...added }));
  }

  function save() {
    setMessage(null);
    if (overlapping.size) {
      setMessage({ tone: "bad", text: `มีห้องวางทับกัน ${overlapping.size} ห้อง (กรอบสีแดง) กรุณาจัดไม่ให้ซ้อนกันก่อนบันทึก` });
      return;
    }
    if (outOfBounds.size) {
      setMessage({ tone: "bad", text: "มีห้องเกินขอบผัง กรุณาขยายขนาดผังหรือย้ายห้องเข้ามา" });
      return;
    }
    startSaving(async () => {
      const res = await saveFloorPlan({
        planId: plan.id,
        name,
        cols,
        rows,
        placements: Object.entries(boxes).map(([unit_id, r]) => ({ unit_id, ...r })),
      });
      if (res?.error) setMessage({ tone: "bad", text: res.error });
      else {
        setMessage({ tone: "ok", text: "บันทึกผังแล้ว" });
        router.refresh();
      }
    });
  }

  const sel = selected ? boxes[selected] : null;
  const selUnit = selected ? unitById.get(selected) : null;
  const ghost = drag?.kind === "new" && drag.moved ? drag : null;
  const ghostUnit = ghost ? unitById.get(ghost.id) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      {/* แถบห้องที่ยังไม่ได้วาง */}
      <aside className="card flex max-h-[70dvh] flex-col overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)]">
        <div className="border-b border-line px-4 py-3">
          <div className="font-semibold">ห้องที่ยังไม่ได้วาง</div>
          <p className="mt-0.5 text-xs text-muted">ลากลงบนผัง หรือแตะห้องแล้วแตะตำแหน่งบนผัง</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {unplaced.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-muted">วางครบทุกห้องแล้ว</p>
          ) : (
            unplacedGroups.map((g) => (
              <div key={g.name} className="mb-3">
                <div className="mb-1.5 px-1 text-xs font-semibold text-muted">
                  {g.name} ({g.units.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.units.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const { w, h } = defaultBox(u.unit_type_code);
                        setDrag({ kind: "new", id: u.id, w, h, clientX: e.clientX, clientY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
                      }}
                      className={clsx(
                        "rounded-lg border-2 px-2 py-1 text-xs font-bold transition select-none",
                        pending === u.id ? "border-ink bg-brand" : "border-line bg-surface hover:border-ink/40",
                      )}
                      style={{ touchAction: "none" }}
                    >
                      {u.code}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {elsewhere.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 px-1 text-xs font-semibold text-muted">อยู่ในชั้น/โซนอื่น ({elsewhere.length})</div>
              <p className="px-1 text-xs text-muted">ถ้าต้องการย้ายมาที่นี่ ให้นำออกจากผังเดิมก่อน</p>
            </div>
          )}
        </div>
        {unplaced.length > 0 && (
          <div className="border-t border-line p-3">
            <button type="button" className="btn btn-outline btn-sm w-full" onClick={autoArrange}>
              <LayoutGrid className="size-3.5" /> วางที่เหลืออัตโนมัติ
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0 space-y-3">
        {/* แถบเครื่องมือ */}
        <div className="card flex flex-wrap items-end gap-3 p-3">
          <label className="min-w-40 flex-1">
            <span className="label">ชื่อชั้น / โซน</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className="input" />
          </label>
          <label className="w-24">
            <span className="label">กว้าง (ช่อง)</span>
            <input type="number" min={10} max={300} value={cols} onChange={(e) => setCols(Math.max(10, Math.min(300, Number(e.target.value) || 10)))} className="input tabular" />
          </label>
          <label className="w-24">
            <span className="label">ยาว (ช่อง)</span>
            <input type="number" min={10} max={300} value={rows} onChange={(e) => setRows(Math.max(10, Math.min(300, Number(e.target.value) || 10)))} className="input tabular" />
          </label>
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-outline size-11 p-0" aria-label="ย่อ" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}>
              <Minus className="size-4" />
            </button>
            <span className="tabular w-11 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn btn-outline size-11 p-0" aria-label="ขยาย" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}>
              <Plus className="size-4" />
            </button>
          </div>
          <div className="ml-auto flex gap-2">
            {dirty && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setBoxes(initial);
                  setName(plan.name);
                  setCols(plan.cols);
                  setRows(plan.rows);
                  setSelected(null);
                  setMessage(null);
                }}
              >
                <Undo2 className="size-4" /> ย้อนกลับ
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
              <Save className="size-4" /> {saving ? "กำลังบันทึก…" : dirty ? "บันทึกผัง" : "บันทึกแล้ว"}
            </button>
          </div>
        </div>

        {message && (
          <div role="status" className={clsx("rounded-xl px-3.5 py-2.5 text-sm", message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
            {message.text}
          </div>
        )}

        {pending && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm">
            <MousePointerClick className="size-4 shrink-0" />
            แตะตำแหน่งบนผังเพื่อวางห้อง <b>{unitById.get(pending)?.code}</b>
            <button type="button" className="ml-auto" onClick={() => setPending(null)} aria-label="ยกเลิก">
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* เครื่องมือของห้องที่เลือก */}
        {sel && selUnit && (
          <div className="card flex flex-wrap items-center gap-2 p-2.5 text-sm">
            <span className="px-1 font-semibold">{selUnit.code}</span>
            <span className="text-muted">{selUnit.unit_type_name}</span>
            <span className="ml-auto flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={100}
                value={sel.w}
                onChange={(e) => setSelectedSize(Number(e.target.value), sel.h)}
                className="input tabular w-16 py-1.5"
                aria-label="กว้าง"
              />
              ×
              <input
                type="number"
                min={1}
                max={100}
                value={sel.h}
                onChange={(e) => setSelectedSize(sel.w, Number(e.target.value))}
                className="input tabular w-16 py-1.5"
                aria-label="ยาว"
              />
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={rotateSelected}>
              <RotateCw className="size-3.5" /> หมุน
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={removeSelected}>
              <Trash2 className="size-3.5" /> นำออกจากผัง
            </button>
          </div>
        )}

        {/* ผัง */}
        <div className="overflow-auto rounded-xl border border-line bg-surface" style={{ maxHeight: "calc(100dvh - 14rem)" }}>
          <div
            ref={canvasRef}
            className={clsx("relative select-none", pending && "cursor-crosshair")}
            style={{ width: cols * cell, height: rows * cell, ...gridBackground(cell) }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (pending) {
                const { cx, cy } = cellFromClient(e.clientX, e.clientY);
                placeAt(pending, cx, cy);
              } else setSelected(null);
            }}
          >
            {Object.entries(boxes).map(([id, b]) => {
              const u = unitById.get(id);
              if (!u) return null;
              const bad = overlapping.has(id) || outOfBounds.has(id);
              const isSel = selected === id;
              return (
                <div
                  key={id}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    setSelected(id);
                    setPending(null);
                    setDrag({ kind: "move", id, startX: e.clientX, startY: e.clientY, orig: b, moved: false });
                  }}
                  className={clsx(
                    "absolute flex cursor-grab flex-col items-center justify-center overflow-hidden rounded-md border-2 text-center leading-tight active:cursor-grabbing",
                    bad ? "border-bad bg-bad-soft text-bad" : u.unit_type_code === "PARKING" ? "border-info/50 bg-info-soft text-ink" : "border-ink/30 bg-brand-soft text-ink",
                    isSel && "z-10 ring-2 ring-ink ring-offset-1",
                  )}
                  style={{ left: b.x * cell + 1, top: b.y * cell + 1, width: b.w * cell - 2, height: b.h * cell - 2, touchAction: "none" }}
                >
                  <span className="font-bold" style={{ fontSize: Math.max(9, Math.min(15, cell * 0.55)) }}>
                    {u.code}
                  </span>
                  {isSel && (
                    <span
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        setDrag({ kind: "resize", id, startX: e.clientX, startY: e.clientY, orig: b, moved: false });
                      }}
                      className="absolute right-0 bottom-0 size-4 cursor-se-resize rounded-tl-md bg-ink"
                      style={{ touchAction: "none" }}
                      aria-label="ลากเพื่อปรับขนาด"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          ลากกล่องเพื่อย้าย ลากมุมขวาล่างเพื่อปรับขนาด · คีย์บอร์ด: ลูกศรขยับ (Shift = 5 ช่อง), R หมุน, Delete นำออก
        </p>
      </div>

      {ghost && ghostUnit && (
        <div
          className="pointer-events-none fixed z-50 flex items-center justify-center rounded-md border-2 border-ink bg-brand text-xs font-bold opacity-90 shadow-lg"
          style={{ left: ghost.clientX - (ghost.w * cell) / 2, top: ghost.clientY - (ghost.h * cell) / 2, width: ghost.w * cell, height: ghost.h * cell }}
        >
          {ghostUnit.code}
        </div>
      )}
    </div>
  );
}
