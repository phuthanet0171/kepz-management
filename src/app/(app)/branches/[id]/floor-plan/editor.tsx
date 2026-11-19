"use client";

import clsx from "clsx";
import {
  ArrowDown,
  ArrowRight,
  Circle,
  Copy,
  ExternalLink,
  LayoutGrid,
  Minus,
  MousePointerClick,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Shapes,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import {
  BASE_CELL,
  defaultBox,
  findFreeSpot,
  gridBackground,
  OBJECT_COLORS,
  OBJECT_PRESETS,
  objectClass,
  overlaps,
  TILE_CLASS,
  TILE_LABEL,
  tileState,
  type Rect,
} from "@/components/floor-plan/shared";
import type { FloorPlan, Placement, PlanColor, PlanObject, PlanShape, PlanUnit, UnitType } from "@/lib/types";
import { saveFloorPlan } from "./actions";

type Box = Rect & { shape: PlanShape };
type Obj = Box & { label: string; color: PlanColor };

/** ทุกอย่างที่แก้ไขได้บนผัง (ใช้เก็บประวัติสำหรับ ย้อนกลับ / ทำซ้ำ) */
type Doc = {
  name: string;
  cols: number;
  rows: number;
  /** unit id → ตำแหน่ง (ห้องเดิมหรือห้องใหม่) */
  boxes: Record<string, Box>;
  /** ห้องใหม่ที่วาดบนผัง ยังไม่ได้บันทึก */
  newUnits: Record<string, { code: string; type: string }>;
  /** ชื่อใหม่ของห้องเดิม */
  codes: Record<string, string>;
  objects: Record<string, Obj>;
};

type Sel = { kind: "unit" | "obj"; id: string } | null;
type Tool =
  | { kind: "unit"; type: string; shape: PlanShape }
  | { kind: "obj"; label: string; color: PlanColor; shape: PlanShape; w: number; h: number }
  | null;

type Drag =
  | {
      kind: "move" | "resize";
      target: { kind: "unit" | "obj"; id: string };
      startX: number;
      startY: number;
      orig: Box;
      before: Doc;
      moved: boolean;
    }
  | {
      kind: "new";
      id: string;
      w: number;
      h: number;
      clientX: number;
      clientY: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | { kind: "draw"; sx: number; sy: number; cx: number; cy: number; moved: boolean };

const uid = () => crypto.randomUUID();
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (c: string) => c.trim().toUpperCase();

function canon(d: Doc) {
  const sort = <T,>(r: Record<string, T>) =>
    Object.keys(r)
      .sort()
      .map((k) => [k, r[k]]);
  return JSON.stringify([d.name, d.cols, d.rows, sort(d.boxes), sort(d.newUnits), sort(d.codes), sort(d.objects)]);
}

/** รหัสถัดไปแบบ PREFIX-01 ที่ยังไม่ถูกใช้ */
function nextCode(prefix: string, used: Set<string>) {
  const p = prefix.toUpperCase();
  let max = 0;
  const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  for (const c of used) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`${p}-${String(n).padStart(2, "0")}`)) n++;
  return `${p}-${String(n).padStart(2, "0")}`;
}

/** ชื่อถัดไปจากชื่อที่ลงท้ายด้วยตัวเลข เช่น A-09 → A-10, ห้อง 3 → ห้อง 4 */
function successor(code: string, used: Set<string>, fallback: () => string) {
  const m = /^(.*?)(\d+)$/.exec(code);
  if (!m) return fallback();
  let n = Number(m[2]) + 1;
  for (let i = 0; i < 2000; i++, n++) {
    const c = `${m[1]}${String(n).padStart(m[2].length, "0")}`;
    if (!used.has(norm(c))) return c;
  }
  return fallback();
}

export function FloorPlanEditor({
  plan,
  placements,
  objects,
  units,
  unitTypes,
  placedElsewhere,
}: {
  plan: FloorPlan;
  placements: Placement[];
  objects: PlanObject[];
  units: PlanUnit[];
  unitTypes: UnitType[];
  /** unit_id → ชื่อผังอื่นที่ห้องนี้ถูกวางไว้ */
  placedElsewhere: Record<string, string>;
}) {
  const router = useRouter();

  const initial = useMemo<Doc>(() => {
    const boxes: Doc["boxes"] = {};
    for (const p of placements) boxes[p.unit_id] = { x: p.x, y: p.y, w: p.w, h: p.h, shape: p.shape ?? "rect" };
    const objs: Doc["objects"] = {};
    for (const o of objects) objs[o.id] = { x: o.x, y: o.y, w: o.w, h: o.h, shape: o.shape, label: o.label, color: o.color };
    return { name: plan.name, cols: plan.cols, rows: plan.rows, boxes, newUnits: {}, codes: {}, objects: objs };
  }, [plan, placements, objects]);

  const [doc, setDocState] = useState<Doc>(initial);
  const docRef = useRef(doc);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [tool, setTool] = useState<Tool>(null);
  const [menu, setMenu] = useState<"unit" | "obj" | null>(null);
  const [pending, setPending] = useState<string | null>(null); // ห้องจากแถบข้างที่รอแตะตำแหน่งวาง
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [resync, setResync] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  /** เปลี่ยนผังและเก็บประวัติให้ย้อนกลับได้ */
  const commit = useCallback((fn: (d: Doc) => Doc) => {
    const d = docRef.current;
    const n = fn(d);
    if (n === d) return;
    setPast((p) => [...p.slice(-79), d]);
    setFuture([]);
    docRef.current = n;
    setDocState(n);
  }, []);
  /** เปลี่ยนระหว่างลาก (ยังไม่เก็บประวัติ) */
  const live = useCallback((fn: (d: Doc) => Doc) => {
    const n = fn(docRef.current);
    docRef.current = n;
    setDocState(n);
  }, []);
  const replace = useCallback((n: Doc) => {
    docRef.current = n;
    setDocState(n);
  }, []);

  // หลังบันทึก: ใช้ข้อมูลจากฐานข้อมูลเป็นจุดเริ่มต้นใหม่ (ห้องใหม่กลายเป็นห้องจริงแล้ว)
  const [base, setBase] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    if (resync) {
      setDocState(initial);
      setPast([]);
      setFuture([]);
      setResync(false);
    }
  }
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const { name, cols, rows, boxes } = doc;
  const cell = BASE_CELL * zoom;
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const typeByCode = useMemo(() => new Map(unitTypes.map((t) => [t.code, t])), [unitTypes]);
  const dirty = useMemo(() => canon(doc) !== canon(initial), [doc, initial]);

  const codeOf = useCallback(
    (id: string, d: Doc = doc) => d.newUnits[id]?.code ?? d.codes[id] ?? unitById.get(id)?.code ?? "",
    [doc, unitById],
  );

  /** ชื่อห้องทั้งหมดของสาขา (ใช้ตรวจชื่อซ้ำและรันชื่อถัดไป) */
  const usedCodes = useCallback(
    (d: Doc) => {
      const s = new Set<string>();
      for (const u of units) s.add(norm(d.codes[u.id] ?? u.code));
      for (const n of Object.values(d.newUnits)) s.add(norm(n.code));
      return s;
    },
    [units],
  );

  const dupCodes = useMemo(() => {
    const count = new Map<string, number>();
    const all = [...units.map((u) => norm(doc.codes[u.id] ?? u.code)), ...Object.values(doc.newUnits).map((n) => norm(n.code))];
    for (const c of all) count.set(c, (count.get(c) ?? 0) + 1);
    return new Set([...count].filter(([c, n]) => n > 1 || !c).map(([c]) => c));
  }, [doc, units]);

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

  const outOfBounds = useMemo(() => {
    const out = new Set<string>();
    for (const [id, b] of [...Object.entries(boxes), ...Object.entries(doc.objects)])
      if (b.x + b.w > cols || b.y + b.h > rows) out.add(id);
    return out;
  }, [boxes, doc.objects, cols, rows]);

  const collator = useMemo(() => new Intl.Collator("th", { numeric: true }), []);
  const unplaced = useMemo(
    () =>
      units
        .filter((u) => !boxes[u.id] && !placedElsewhere[u.id] && u.status !== "inactive")
        .sort((a, b) => a.type_sort - b.type_sort || collator.compare(a.code, b.code)),
    [units, boxes, placedElsewhere, collator],
  );
  const elsewhereCount = units.filter((u) => !boxes[u.id] && placedElsewhere[u.id]).length;

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
      return {
        cx: (clientX - r.left) / cell,
        cy: (clientY - r.top) / cell,
        inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom,
      };
    },
    [cell],
  );

  const fit = useCallback(
    (w: number, h: number, cx: number, cy: number) => {
      const ww = clamp(w, 1, cols);
      const hh = clamp(h, 1, rows);
      return { x: clamp(Math.round(cx - ww / 2), 0, cols - ww), y: clamp(Math.round(cy - hh / 2), 0, rows - hh), w: ww, h: hh };
    },
    [cols, rows],
  );

  /** วางห้องเดิมที่ยังไม่ได้อยู่บนผัง */
  const placeExisting = useCallback(
    (id: string, cx: number, cy: number) => {
      const u = unitById.get(id);
      if (!u) return;
      const { w, h } = defaultBox(u.unit_type_code);
      commit((d) => ({ ...d, boxes: { ...d.boxes, [id]: { ...fit(w, h, cx, cy), shape: "rect" } } }));
      setSel({ kind: "unit", id });
      setPending(null);
    },
    [unitById, commit, fit],
  );

  /** วาดเสร็จ: สร้างห้องใหม่หรือสัญลักษณ์ตามเครื่องมือที่เลือก */
  const createFromTool = useCallback(
    (rect: Rect | null, cx: number, cy: number) => {
      if (!tool) return;
      if (tool.kind === "unit") {
        const t = typeByCode.get(tool.type);
        if (!t) return;
        let { w, h } = defaultBox(t.code);
        if (tool.shape === "circle") w = h = Math.max(w, h);
        const r = rect ?? fit(w, h, cx, cy);
        const id = uid();
        commit((d) => ({
          ...d,
          boxes: { ...d.boxes, [id]: { ...r, shape: tool.shape } },
          newUnits: { ...d.newUnits, [id]: { code: nextCode(t.code_prefix, usedCodes(d)), type: t.code } },
        }));
        setSel({ kind: "unit", id });
      } else {
        const r = rect ?? fit(tool.w, tool.h, cx, cy);
        const id = uid();
        commit((d) => ({
          ...d,
          objects: { ...d.objects, [id]: { ...r, shape: tool.shape, label: tool.label, color: tool.color } },
        }));
        setSel({ kind: "obj", id });
      }
      setTool(null);
    },
    [tool, typeByCode, fit, commit, usedCodes],
  );

  // ลาก: ย้าย / ปรับขนาด / ลากห้องจากแถบข้าง / วาดกล่องใหม่ (รองรับเมาส์และนิ้วบนแท็บเล็ต)
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.kind === "new") {
        const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4;
        setDrag({ ...drag, clientX: e.clientX, clientY: e.clientY, moved });
        return;
      }
      if (drag.kind === "draw") {
        const { cx, cy } = cellFromClient(e.clientX, e.clientY);
        const x = clamp(Math.floor(cx), 0, cols - 1);
        const y = clamp(Math.floor(cy), 0, rows - 1);
        if (x !== drag.cx || y !== drag.cy) setDrag({ ...drag, cx: x, cy: y, moved: true });
        return;
      }
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const moved = drag.moved || Math.abs(dxPx) > 4 || Math.abs(dyPx) > 4;
      const dx = Math.round(dxPx / cell);
      const dy = Math.round(dyPx / cell);
      const o = drag.orig;
      const next =
        drag.kind === "move"
          ? { ...o, x: clamp(o.x + dx, 0, cols - o.w), y: clamp(o.y + dy, 0, rows - o.h) }
          : { ...o, w: clamp(o.w + dx, 1, cols - o.x), h: clamp(o.h + dy, 1, rows - o.y) };
      live((d) => {
        const key = drag.target.kind === "unit" ? "boxes" : "objects";
        const cur = d[key][drag.target.id];
        if (!cur || (cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h)) return d;
        return { ...d, [key]: { ...d[key], [drag.target.id]: { ...cur, x: next.x, y: next.y, w: next.w, h: next.h } } };
      });
      if (moved !== drag.moved) setDrag({ ...drag, moved });
    };
    const onUp = (e: PointerEvent) => {
      if (drag.kind === "new") {
        const { cx, cy, inside } = cellFromClient(e.clientX, e.clientY);
        if (drag.moved && inside) placeExisting(drag.id, cx, cy);
        else if (!drag.moved) setPending((p) => (p === drag.id ? null : drag.id));
      } else if (drag.kind === "draw") {
        const rect = drag.moved
          ? {
              x: Math.min(drag.sx, drag.cx),
              y: Math.min(drag.sy, drag.cy),
              w: Math.abs(drag.cx - drag.sx) + 1,
              h: Math.abs(drag.cy - drag.sy) + 1,
            }
          : null;
        createFromTool(rect, drag.sx + 0.5, drag.sy + 0.5);
      } else if (drag.moved && canon(drag.before) !== canon(docRef.current)) {
        setPast((p) => [...p.slice(-79), drag.before]);
        setFuture([]);
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
  }, [drag, cell, cols, rows, cellFromClient, placeExisting, createFromTool, live]);

  function undo() {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [docRef.current, ...f]);
    replace(prev);
    setSel((s) => (s && (s.kind === "unit" ? prev.boxes[s.id] : prev.objects[s.id]) ? s : null));
  }
  function redo() {
    if (!future.length) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, docRef.current]);
    replace(next);
    setSel((s) => (s && (s.kind === "unit" ? next.boxes[s.id] : next.objects[s.id]) ? s : null));
  }

  const selBox: Box | null = sel ? (sel.kind === "unit" ? (boxes[sel.id] ?? null) : (doc.objects[sel.id] ?? null)) : null;

  function patchSel(p: Partial<Obj>) {
    if (!sel) return;
    commit((d) => {
      const key = sel.kind === "unit" ? "boxes" : "objects";
      const o = d[key][sel.id];
      if (!o) return d;
      const n = { ...o, ...p };
      n.w = clamp(n.w || 1, 1, d.cols - n.x);
      n.h = clamp(n.h || 1, 1, d.rows - n.y);
      return { ...d, [key]: { ...d[key], [sel.id]: n } };
    });
  }

  function rotateSel() {
    if (!selBox) return;
    const w = Math.min(selBox.h, cols);
    const h = Math.min(selBox.w, rows);
    patchSel({ w, h, x: Math.min(selBox.x, cols - w), y: Math.min(selBox.y, rows - h) });
  }

  function removeSel() {
    if (!sel) return;
    commit((d) => {
      if (sel.kind === "obj") {
        const objects = { ...d.objects };
        delete objects[sel.id];
        return { ...d, objects };
      }
      const b = { ...d.boxes };
      delete b[sel.id];
      const newUnits = { ...d.newUnits };
      delete newUnits[sel.id];
      return { ...d, boxes: b, newUnits };
    });
    setSel(null);
  }

  function renameSel(code: string) {
    if (sel?.kind !== "unit") return;
    const id = sel.id;
    commit((d) => {
      if (d.newUnits[id]) return { ...d, newUnits: { ...d.newUnits, [id]: { ...d.newUnits[id], code } } };
      const codes = { ...d.codes };
      if (code === unitById.get(id)?.code) delete codes[id];
      else codes[id] = code;
      return { ...d, codes };
    });
  }

  /** ทำซ้ำต่อกันเป็นแถว (count ชิ้น) ไปทางขวาหรือลงล่าง */
  function repeatSel(count: number, dir: "right" | "down") {
    if (!sel || !selBox) return;
    const d0 = docRef.current;
    const unitRects = Object.values(d0.boxes);
    const made: { id: string; box: Box; code?: string; type?: string }[] = [];
    const used = usedCodes(d0);
    let lastCode = sel.kind === "unit" ? codeOf(sel.id, d0) : "";
    const type = sel.kind === "unit" ? (d0.newUnits[sel.id]?.type ?? unitById.get(sel.id)?.unit_type_code ?? "") : "";
    const prefix = typeByCode.get(type)?.code_prefix ?? "R";
    let stopped = false;
    for (let i = 1; i <= count; i++) {
      const box = {
        ...selBox,
        x: dir === "right" ? selBox.x + i * selBox.w : selBox.x,
        y: dir === "down" ? selBox.y + i * selBox.h : selBox.y,
      };
      if (
        box.x + box.w > d0.cols ||
        box.y + box.h > d0.rows ||
        (sel.kind === "unit" && unitRects.some((r) => overlaps(r, box)))
      ) {
        stopped = true;
        break;
      }
      if (sel.kind === "unit") {
        const code = successor(lastCode, used, () => nextCode(prefix, used));
        used.add(norm(code));
        lastCode = code;
        made.push({ id: uid(), box, code, type });
      } else made.push({ id: uid(), box });
    }
    if (made.length) {
      commit((d) => {
        if (sel.kind === "obj") {
          const o = d.objects[sel.id];
          const objects = { ...d.objects };
          for (const m of made) objects[m.id] = { ...o, ...m.box };
          return { ...d, objects };
        }
        const b = { ...d.boxes };
        const nu = { ...d.newUnits };
        for (const m of made) {
          b[m.id] = m.box;
          nu[m.id] = { code: m.code!, type: m.type! };
        }
        return { ...d, boxes: b, newUnits: nu };
      });
      setSel({ kind: sel.kind, id: made[made.length - 1].id });
    }
    setMessage(
      stopped
        ? {
            tone: "bad",
            text: made.length
              ? `เพิ่มได้ ${made.length} ชิ้น พื้นที่ด้าน${dir === "right" ? "ขวา" : "ล่าง"}ไม่พอหรือมีห้องขวางอยู่`
              : `ด้าน${dir === "right" ? "ขวา" : "ล่าง"}ไม่มีที่ว่างพอ ลองอีกทิศหรือขยายผัง`,
          }
        : null,
    );
  }

  function duplicateSel() {
    if (!sel || !selBox) return;
    const d0 = docRef.current;
    const others = sel.kind === "unit" ? Object.values(d0.boxes) : [];
    const free = (r: Rect) => r.x + r.w <= d0.cols && r.y + r.h <= d0.rows && !others.some((o) => overlaps(o, r));
    const cands = [
      { ...selBox, x: selBox.x + selBox.w },
      { ...selBox, y: selBox.y + selBox.h },
    ];
    const spot = cands.find(free) ?? (sel.kind === "unit" ? findFreeSpot(others, selBox.w, selBox.h, d0.cols, d0.rows) : null);
    if (sel.kind === "obj") {
      const id = uid();
      const box = spot
        ? { ...selBox, ...spot }
        : { ...selBox, x: Math.min(selBox.x + 1, d0.cols - selBox.w), y: Math.min(selBox.y + 1, d0.rows - selBox.h) };
      commit((d) => ({ ...d, objects: { ...d.objects, [id]: { ...d.objects[sel.id], ...box } } }));
      setSel({ kind: "obj", id });
      return;
    }
    if (!spot) {
      setMessage({ tone: "bad", text: "ไม่มีที่ว่างบนผัง ขยายขนาดผังก่อน" });
      return;
    }
    repeatSelAt({ ...selBox, ...spot });
  }

  function repeatSelAt(box: Box) {
    if (sel?.kind !== "unit") return;
    const d0 = docRef.current;
    const used = usedCodes(d0);
    const type = d0.newUnits[sel.id]?.type ?? unitById.get(sel.id)?.unit_type_code ?? "";
    const prefix = typeByCode.get(type)?.code_prefix ?? "R";
    const code = successor(codeOf(sel.id, d0), used, () => nextCode(prefix, used));
    const id = uid();
    commit((d) => ({ ...d, boxes: { ...d.boxes, [id]: box }, newUnits: { ...d.newUnits, [id]: { code, type } } }));
    setSel({ kind: "unit", id });
  }

  function autoArrange() {
    const rects: Rect[] = Object.values(boxes);
    const added: Doc["boxes"] = {};
    let lastType = "";
    let cursor = { x: 0, y: 0 };
    for (const u of unplaced) {
      const { w, h } = defaultBox(u.unit_type_code);
      const all = [...rects, ...Object.values(added)];
      if (u.unit_type_code !== lastType) {
        const bottom = Math.max(0, ...all.map((r) => r.y + r.h));
        cursor = { x: 0, y: lastType ? Math.min(bottom + 1, rows - 1) : 0 };
        lastType = u.unit_type_code;
      }
      const spot = findFreeSpot(all, w, h, cols, rows, cursor) ?? findFreeSpot(all, w, h, cols, rows);
      if (!spot) {
        setMessage({ tone: "bad", text: "พื้นที่ผังไม่พอ ขยายขนาดผังก่อน แล้วลองจัดอัตโนมัติอีกครั้ง" });
        break;
      }
      added[u.id] = { ...spot, shape: "rect" };
      cursor = { x: spot.x + spot.w, y: spot.y };
    }
    commit((d) => ({ ...d, boxes: { ...d.boxes, ...added } }));
  }

  // แป้นพิมพ์
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setTool(null);
        setMenu(null);
        setPending(null);
        setSel(null);
        return;
      }
      if (!sel || !selBox) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSel();
        return;
      }
      const step = e.shiftKey ? 5 : 1;
      const mv: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (mv[e.key]) {
        e.preventDefault();
        patchSel({
          x: clamp(selBox.x + mv[e.key][0], 0, cols - selBox.w),
          y: clamp(selBox.y + mv[e.key][1], 0, rows - selBox.h),
        });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSel();
      } else if (e.key === "r" || e.key === "R") {
        rotateSel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function save() {
    setMessage(null);
    if (overlapping.size) {
      setMessage({ tone: "bad", text: `มีห้องวางทับกัน ${overlapping.size} ห้อง (กรอบสีแดง) กรุณาจัดไม่ให้ซ้อนกันก่อนบันทึก` });
      return;
    }
    if (outOfBounds.size) {
      setMessage({ tone: "bad", text: "มีกล่องเกินขอบผัง กรุณาขยายขนาดผังหรือย้ายเข้ามา" });
      return;
    }
    const placedCodes = Object.keys(boxes).map((id) => norm(codeOf(id)));
    if (placedCodes.some((c) => !c)) {
      setMessage({ tone: "bad", text: "มีห้องที่ยังไม่ได้ตั้งชื่อ" });
      return;
    }
    if (dupCodes.size) {
      setMessage({ tone: "bad", text: `ชื่อห้องซ้ำกัน: ${[...dupCodes].filter(Boolean).join(", ")} กรุณาเปลี่ยนชื่อให้ไม่ซ้ำ` });
      return;
    }
    const renames = Object.entries(doc.codes)
      .filter(([id, c]) => norm(c) !== norm(unitById.get(id)?.code ?? ""))
      .map(([id, code]) => ({ id, code: norm(code) }));
    startSaving(async () => {
      const res = await saveFloorPlan({
        planId: plan.id,
        name,
        cols,
        rows,
        placements: Object.entries(boxes).map(([unit_id, b]) => ({ unit_id, x: b.x, y: b.y, w: b.w, h: b.h, shape: b.shape })),
        objects: Object.entries(doc.objects).map(([id, o]) => ({ id, ...o, label: o.label.trim() })),
        newUnits: Object.entries(doc.newUnits).map(([id, n]) => ({ id, code: norm(n.code), unit_type_code: n.type })),
        renames,
      });
      if (res?.error) setMessage({ tone: "bad", text: res.error });
      else {
        setMessage({ tone: "ok", text: res?.message ?? "บันทึกผังแล้ว" });
        setResync(true);
        router.refresh();
      }
    });
  }

  const selUnit = sel?.kind === "unit" ? unitById.get(sel.id) : undefined;
  const selNew = sel?.kind === "unit" ? doc.newUnits[sel.id] : undefined;
  const selObj = sel?.kind === "obj" ? doc.objects[sel.id] : undefined;
  const ghost = drag?.kind === "new" && drag.moved ? drag : null;
  const ghostUnit = ghost ? unitById.get(ghost.id) : null;
  const drawRect =
    drag?.kind === "draw" && drag.moved
      ? {
          x: Math.min(drag.sx, drag.cx),
          y: Math.min(drag.sy, drag.cy),
          w: Math.abs(drag.cx - drag.sx) + 1,
          h: Math.abs(drag.cy - drag.sy) + 1,
        }
      : null;
  const newCount = Object.keys(doc.newUnits).length;
  const toolLabel = tool ? (tool.kind === "unit" ? (typeByCode.get(tool.type)?.name ?? "") : tool.label || "สัญลักษณ์") : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {/* แผงซ้าย: คุณสมบัติของสิ่งที่เลือก หรือ ตั้งค่าผัง + ห้องที่ยังไม่ได้วาง */}
      <aside className="card flex max-h-[75dvh] flex-col overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)]">
        {sel && selBox ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {sel.kind === "obj" ? "สัญลักษณ์" : selNew ? "ห้องใหม่" : `ห้อง ${selUnit?.code ?? ""}`}
                </div>
                <div className="text-xs text-muted">
                  {sel.kind === "obj"
                    ? "ไม่ใช่ห้องเช่า ใช้บอกตำแหน่งบนผัง"
                    : selNew
                      ? "ยังไม่ได้บันทึก กด “บันทึกผัง” แล้วจะพร้อมทำสัญญา"
                      : selUnit
                        ? `${selUnit.unit_type_name} · ${selUnit.tenant_name ?? TILE_LABEL[tileState(selUnit)]}`
                        : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost size-9 min-h-0 shrink-0 p-0"
                onClick={() => setSel(null)}
                aria-label="ปิด"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {sel.kind === "unit" ? (
                <>
                  <label className="block">
                    <span className="label">ชื่อห้อง (ใช้ในสัญญาและใบวางบิล)</span>
                    <input
                      value={codeOf(sel.id)}
                      onChange={(e) => renameSel(e.target.value.slice(0, 20))}
                      maxLength={20}
                      className={clsx("input uppercase", dupCodes.has(norm(codeOf(sel.id))) && "border-bad")}
                    />
                    {dupCodes.has(norm(codeOf(sel.id))) && (
                      <span className="mt-1 block text-xs text-bad">
                        {codeOf(sel.id).trim() ? "ชื่อนี้ซ้ำกับห้องอื่น" : "กรุณาตั้งชื่อห้อง"}
                      </span>
                    )}
                  </label>
                  {selNew ? (
                    <label className="block">
                      <span className="label">ประเภท</span>
                      <select
                        value={selNew.type}
                        onChange={(e) =>
                          commit((d) => ({
                            ...d,
                            newUnits: { ...d.newUnits, [sel.id]: { ...d.newUnits[sel.id], type: e.target.value } },
                          }))
                        }
                        className="input"
                      >
                        {unitTypes.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.name} · {t.default_monthly_price.toLocaleString()} บาท/เดือน
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    selUnit && (
                      <Link
                        href={`/units/${selUnit.id}`}
                        target="_blank"
                        className="flex items-center gap-1.5 text-sm text-ink-2 underline"
                      >
                        <ExternalLink className="size-3.5" /> เปิดหน้าห้อง (แก้ประเภท ราคา สถานะ)
                      </Link>
                    )
                  )}
                </>
              ) : (
                selObj && (
                  <>
                    <label className="block">
                      <span className="label">ข้อความบนสัญลักษณ์</span>
                      <input
                        value={selObj.label}
                        onChange={(e) => patchSel({ label: e.target.value.slice(0, 40) })}
                        maxLength={40}
                        placeholder="เช่น ทางเข้า, ลิฟต์, โซน A"
                        className="input"
                      />
                    </label>
                    <div>
                      <span className="label">สี</span>
                      <div className="flex flex-wrap gap-2">
                        {OBJECT_COLORS.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            title={c.label}
                            aria-label={c.label}
                            onClick={() => patchSel({ color: c.key })}
                            className={clsx(
                              "size-8 rounded-full border-2 transition",
                              selObj.color === c.key ? "border-ink ring-2 ring-brand ring-offset-1" : "border-line",
                              c.key === "none" && "bg-[repeating-linear-gradient(45deg,#fff_0_4px,#e5e7eb_4px_6px)]",
                            )}
                            style={c.key === "none" ? undefined : { background: c.swatch }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )
              )}

              <Segmented
                label="รูปทรง"
                value={selBox.shape}
                onChange={(shape) => patchSel({ shape })}
                options={[
                  { value: "rect", label: "สี่เหลี่ยม", icon: <Square className="size-4" /> },
                  { value: "circle", label: "วงกลม", icon: <Circle className="size-4" /> },
                ]}
              />

              <div>
                <span className="label">ขนาด (ช่อง) กว้าง × ยาว</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={selBox.w}
                    onChange={(e) => patchSel({ w: Number(e.target.value) })}
                    className="input tabular w-20"
                    aria-label="กว้าง"
                  />
                  ×
                  <input
                    type="number"
                    min={1}
                    value={selBox.h}
                    onChange={(e) => patchSel({ h: Number(e.target.value) })}
                    className="input tabular w-20"
                    aria-label="ยาว"
                  />
                  <button
                    type="button"
                    className="btn btn-outline size-11 shrink-0 p-0"
                    onClick={rotateSel}
                    title="หมุน (R)"
                    aria-label="หมุน"
                  >
                    <RotateCw className="size-4" />
                  </button>
                </div>
              </div>

              <RepeatBox kind={sel.kind} onRepeat={repeatSel} />

              <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
                <button type="button" className="btn btn-outline" onClick={duplicateSel} title="Ctrl+D">
                  <Copy className="size-4" /> ทำซ้ำ
                </button>
                <button type="button" className="btn btn-danger" onClick={removeSel} title="Delete">
                  <Trash2 className="size-4" /> {sel.kind === "unit" && !selNew ? "นำออกจากผัง" : "ลบ"}
                </button>
              </div>
              {sel.kind === "unit" && !selNew && (
                <p className="text-xs text-muted">นำออกจากผังเท่านั้น ห้องและสัญญายังอยู่ในระบบ ย้ายไปอยู่ในรายการ “ห้องที่ยังไม่ได้วาง”</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3 border-b border-line p-4">
              <label className="block">
                <span className="label">ชื่อชั้น / โซน</span>
                <input
                  value={name}
                  onChange={(e) => commit((d) => ({ ...d, name: e.target.value }))}
                  maxLength={50}
                  className="input"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">กว้าง (ช่อง)</span>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={cols}
                    onChange={(e) => commit((d) => ({ ...d, cols: clamp(Number(e.target.value) || 10, 10, 300) }))}
                    className="input tabular"
                  />
                </label>
                <label className="block">
                  <span className="label">ยาว (ช่อง)</span>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={rows}
                    onChange={(e) => commit((d) => ({ ...d, rows: clamp(Number(e.target.value) || 10, 10, 300) }))}
                    className="input tabular"
                  />
                </label>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-2 px-1">
                <div className="text-sm font-semibold">ห้องที่ยังไม่ได้วาง</div>
                <p className="text-xs text-muted">ห้องที่มีอยู่แล้วในระบบ ลากลงบนผัง หรือแตะห้องแล้วแตะตำแหน่ง</p>
              </div>
              {unplaced.length === 0 ? (
                <p className="px-1 py-3 text-sm text-muted">วางครบทุกห้องแล้ว เพิ่มห้องใหม่ได้จากปุ่ม “เพิ่มห้อง / ที่จอด” ด้านบน</p>
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
                            setDrag({
                              kind: "new",
                              id: u.id,
                              w,
                              h,
                              clientX: e.clientX,
                              clientY: e.clientY,
                              startX: e.clientX,
                              startY: e.clientY,
                              moved: false,
                            });
                          }}
                          className={clsx(
                            "rounded-lg border-2 px-2 py-1 text-xs font-bold transition select-none",
                            pending === u.id ? "border-ink bg-brand" : "border-line bg-surface hover:border-ink/40",
                          )}
                          style={{ touchAction: "none" }}
                        >
                          {doc.codes[u.id] ?? u.code}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {elsewhereCount > 0 && (
                <p className="mt-3 border-t border-line px-1 pt-3 text-xs text-muted">
                  อีก {elsewhereCount} ห้องอยู่ในชั้น/โซนอื่น ถ้าต้องการย้ายมาที่นี่ ให้นำออกจากผังเดิมก่อน
                </p>
              )}
            </div>
            {unplaced.length > 0 && (
              <div className="border-t border-line p-3">
                <button type="button" className="btn btn-outline btn-sm w-full" onClick={autoArrange}>
                  <LayoutGrid className="size-3.5" /> วางที่เหลืออัตโนมัติ
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      <div className="min-w-0 space-y-3">
        {/* แถบเครื่องมือ */}
        <div className="card flex flex-wrap items-center gap-2 p-2.5">
          <div className="relative">
            <button
              type="button"
              className={clsx("btn", tool?.kind === "unit" || menu === "unit" ? "btn-brand" : "btn-primary")}
              onClick={() => setMenu((m) => (m === "unit" ? null : "unit"))}
              aria-expanded={menu === "unit"}
            >
              <Plus className="size-4" /> เพิ่มห้อง / ที่จอด
            </button>
            {menu === "unit" && (
              <Popover onClose={() => setMenu(null)}>
                <div className="px-3 pt-2 pb-1 text-xs text-muted">เลือกประเภทและรูปทรง แล้วคลิกหรือลากบนผัง</div>
                {unitTypes.map((t) => (
                  <div key={t.code} className="flex items-center gap-1 px-1.5">
                    <span className="min-w-0 flex-1 truncate px-1.5 py-2 text-sm">
                      <b>{t.name}</b> <span className="text-xs text-muted">{t.code_prefix}-xx</span>
                    </span>
                    {(["rect", "circle"] as const).map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        className="btn btn-outline btn-sm gap-1 px-2"
                        title={shape === "rect" ? "สี่เหลี่ยม" : "วงกลม"}
                        aria-label={`${t.name} ${shape === "rect" ? "สี่เหลี่ยม" : "วงกลม"}`}
                        onClick={() => {
                          setTool({ kind: "unit", type: t.code, shape });
                          setMenu(null);
                          setSel(null);
                          setPending(null);
                        }}
                      >
                        {shape === "rect" ? <Square className="size-3.5" /> : <Circle className="size-3.5" />}
                        {shape === "rect" ? "สี่เหลี่ยม" : "วงกลม"}
                      </button>
                    ))}
                  </div>
                ))}
              </Popover>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className={clsx("btn", tool?.kind === "obj" || menu === "obj" ? "btn-brand" : "btn-outline")}
              onClick={() => setMenu((m) => (m === "obj" ? null : "obj"))}
              aria-expanded={menu === "obj"}
            >
              <Shapes className="size-4" /> สัญลักษณ์
            </button>
            {menu === "obj" && (
              <Popover onClose={() => setMenu(null)}>
                <div className="px-3 pt-2 pb-1 text-xs text-muted">ไม่ใช่ห้องเช่า ใช้บอกตำแหน่ง แก้ข้อความและสีได้ภายหลัง</div>
                <div className="grid grid-cols-2 gap-1 p-1.5">
                  {OBJECT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-canvas"
                      onClick={() => {
                        setTool({ kind: "obj", ...p });
                        setMenu(null);
                        setSel(null);
                        setPending(null);
                      }}
                    >
                      <span
                        className={clsx(
                          "size-5 shrink-0 border-2",
                          p.shape === "circle" ? "rounded-full" : "rounded",
                          objectClass(p.color),
                          p.color === "none" && "border-dashed !border-muted",
                        )}
                      />
                      {p.label}
                    </button>
                  ))}
                </div>
              </Popover>
            )}
          </div>

          <span className="mx-1 hidden h-7 w-px bg-line sm:block" />
          <button
            type="button"
            className="btn btn-ghost size-11 p-0"
            onClick={undo}
            disabled={!past.length}
            title="ย้อนกลับ (Ctrl+Z)"
            aria-label="ย้อนกลับ"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost size-11 p-0"
            onClick={redo}
            disabled={!future.length}
            title="ทำซ้ำ (Ctrl+Y)"
            aria-label="ทำซ้ำ"
          >
            <Redo2 className="size-4" />
          </button>
          <span className="mx-1 hidden h-7 w-px bg-line sm:block" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost size-11 p-0"
              aria-label="ย่อ"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
            >
              <Minus className="size-4" />
            </button>
            <span className="tabular w-11 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="btn btn-ghost size-11 p-0"
              aria-label="ขยาย"
              onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  commit(() => initial);
                  setSel(null);
                  setMessage(null);
                }}
              >
                ยกเลิกที่แก้
              </button>
            )}
            <button type="button" className="btn btn-primary" disabled={saving || resync || !dirty} onClick={save}>
              <Save className="size-4" />
              {saving ? "กำลังบันทึก…" : dirty ? (newCount ? `บันทึกผัง (+${newCount} ห้องใหม่)` : "บันทึกผัง") : "บันทึกแล้ว"}
            </button>
          </div>
        </div>

        {message && (
          <div
            role="status"
            className={clsx(
              "flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm",
              message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad",
            )}
          >
            <span className="flex-1">{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="ปิด">
              <X className="size-4" />
            </button>
          </div>
        )}

        {(tool || pending) && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm">
            <MousePointerClick className="size-4 shrink-0" />
            {tool ? (
              <span>
                <b>คลิก</b>บนผังเพื่อวาง <b>{toolLabel}</b> หรือ<b>ลาก</b>เพื่อกำหนดขนาดเอง
              </span>
            ) : (
              <span>
                แตะตำแหน่งบนผังเพื่อวางห้อง <b>{pending && (doc.codes[pending] ?? unitById.get(pending)?.code)}</b>
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => {
                setTool(null);
                setPending(null);
              }}
            >
              ยกเลิก
            </button>
          </div>
        )}

        {/* ผัง */}
        <div className="overflow-auto rounded-xl border border-line bg-surface" style={{ maxHeight: "calc(100dvh - 14rem)" }}>
          <div
            ref={canvasRef}
            className={clsx("relative select-none", (pending || tool) && "cursor-crosshair")}
            style={{ width: cols * cell, height: rows * cell, ...gridBackground(cell) }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (pending) {
                const { cx, cy } = cellFromClient(e.clientX, e.clientY);
                placeExisting(pending, cx, cy);
              } else setSel(null);
              setMenu(null);
            }}
          >
            {/* สัญลักษณ์อยู่ชั้นล่าง ห้องอยู่ด้านบน */}
            {Object.entries(doc.objects).map(([id, o]) => {
              const isSel = sel?.kind === "obj" && sel.id === id;
              return (
                <ItemBox
                  key={id}
                  box={o}
                  cell={cell}
                  selected={isSel}
                  className={clsx(
                    objectClass(o.color),
                    o.color === "none" && "!border-dashed !border-muted/40",
                    outOfBounds.has(id) && "!border-bad",
                  )}
                  fontScale={o.color === "none" ? 0.7 : 0.5}
                  label={o.label}
                  onPointerDown={(e) => {
                    setSel({ kind: "obj", id });
                    setPending(null);
                    setMenu(null);
                    setDrag({
                      kind: "move",
                      target: { kind: "obj", id },
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: o,
                      before: docRef.current,
                      moved: false,
                    });
                  }}
                  onResizeDown={(e) =>
                    setDrag({
                      kind: "resize",
                      target: { kind: "obj", id },
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: o,
                      before: docRef.current,
                      moved: false,
                    })
                  }
                />
              );
            })}
            {Object.entries(boxes).map(([id, b]) => {
              const u = unitById.get(id);
              const isNew = !!doc.newUnits[id];
              if (!u && !isNew) return null;
              const bad = overlapping.has(id) || outOfBounds.has(id) || dupCodes.has(norm(codeOf(id)));
              const isSel = sel?.kind === "unit" && sel.id === id;
              return (
                <ItemBox
                  key={id}
                  box={b}
                  cell={cell}
                  selected={isSel}
                  className={clsx(
                    "z-[1]",
                    bad
                      ? "border-bad bg-bad-soft text-bad"
                      : isNew
                        ? "border-dashed border-ink bg-surface text-ink"
                        : TILE_CLASS[tileState(u!)],
                  )}
                  fontScale={0.55}
                  label={codeOf(id)}
                  badge={isNew ? "ใหม่" : undefined}
                  onPointerDown={(e) => {
                    setSel({ kind: "unit", id });
                    setPending(null);
                    setMenu(null);
                    setDrag({
                      kind: "move",
                      target: { kind: "unit", id },
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: b,
                      before: docRef.current,
                      moved: false,
                    });
                  }}
                  onResizeDown={(e) =>
                    setDrag({
                      kind: "resize",
                      target: { kind: "unit", id },
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: b,
                      before: docRef.current,
                      moved: false,
                    })
                  }
                />
              );
            })}

            {drawRect && (
              <div
                className={clsx(
                  "pointer-events-none absolute z-20 border-2 border-dashed border-ink bg-brand/40",
                  tool?.shape === "circle" ? "rounded-full" : "rounded-md",
                )}
                style={{ left: drawRect.x * cell, top: drawRect.y * cell, width: drawRect.w * cell, height: drawRect.h * cell }}
              />
            )}

            {/* โหมดวาด: รับคลิก/ลากทั้งผัง */}
            {tool && (
              <div
                className="absolute inset-0 z-10 cursor-crosshair"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const { cx, cy } = cellFromClient(e.clientX, e.clientY);
                  const x = clamp(Math.floor(cx), 0, cols - 1);
                  const y = clamp(Math.floor(cy), 0, rows - 1);
                  setDrag({ kind: "draw", sx: x, sy: y, cx: x, cy: y, moved: false });
                }}
              />
            )}
          </div>
        </div>

        <p className="text-xs text-muted">
          ลากเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับขนาด · ลูกศรขยับ (Shift = 5 ช่อง) · R หมุน · Ctrl+D ทำซ้ำ · Ctrl+Z ย้อนกลับ · Delete ลบ
        </p>
      </div>

      {ghost && ghostUnit && (
        <div
          className="pointer-events-none fixed z-50 flex items-center justify-center rounded-md border-2 border-ink bg-brand text-xs font-bold opacity-90 shadow-lg"
          style={{
            left: ghost.clientX - (ghost.w * cell) / 2,
            top: ghost.clientY - (ghost.h * cell) / 2,
            width: ghost.w * cell,
            height: ghost.h * cell,
          }}
        >
          {doc.codes[ghostUnit.id] ?? ghostUnit.code}
        </div>
      )}
    </div>
  );
}

function ItemBox({
  box,
  cell,
  selected,
  className,
  label,
  badge,
  fontScale,
  onPointerDown,
  onResizeDown,
}: {
  box: Box;
  cell: number;
  selected: boolean;
  className: string;
  label: string;
  badge?: string;
  fontScale: number;
  onPointerDown: (e: RPointerEvent) => void;
  onResizeDown: (e: RPointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPointerDown(e);
      }}
      className={clsx(
        "absolute flex cursor-grab flex-col items-center justify-center border-2 text-center leading-tight active:cursor-grabbing",
        box.shape === "circle" ? "rounded-full" : "rounded-md",
        className,
        selected && "z-[5] ring-2 ring-ink ring-offset-1",
      )}
      style={{
        left: box.x * cell + 1,
        top: box.y * cell + 1,
        width: box.w * cell - 2,
        height: box.h * cell - 2,
        touchAction: "none",
      }}
    >
      <span className="max-w-full truncate px-0.5 font-bold" style={{ fontSize: Math.max(9, Math.min(16, cell * fontScale)) }}>
        {label}
      </span>
      {badge && box.h * cell >= 40 && (
        <span className="rounded bg-brand px-1 text-[10px] leading-4 font-semibold text-ink">{badge}</span>
      )}
      {selected && (
        <span
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onResizeDown(e);
          }}
          className="absolute -right-1.5 -bottom-1.5 size-4 cursor-se-resize rounded-sm border-2 border-white bg-ink"
          style={{ touchAction: "none" }}
          aria-label="ลากเพื่อปรับขนาด"
        />
      )}
    </div>
  );
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: PointerEvent) => {
      const btn = ref.current?.parentElement;
      if (btn && !btn.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-40 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface py-1 shadow-xl"
    >
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: ReactNode }[];
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/50 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={clsx(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition",
              value === o.value ? "bg-surface shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** ทำซ้ำเป็นแถว: ใส่จำนวนแล้วเลือกทิศ ชื่อห้องรันต่อให้อัตโนมัติ */
function RepeatBox({ kind, onRepeat }: { kind: "unit" | "obj"; onRepeat: (n: number, dir: "right" | "down") => void }) {
  const [n, setN] = useState(5);
  return (
    <div className="rounded-xl bg-brand-soft p-3">
      <div className="text-sm font-semibold">วางซ้ำต่อกันเป็นแถว</div>
      <p className="mb-2 text-xs text-ink-2">
        {kind === "unit" ? "เพิ่มห้องขนาดเดียวกัน ชื่อรันต่อให้อัตโนมัติ เช่น A-01 → A-02, A-03" : "เพิ่มสัญลักษณ์แบบเดียวกันต่อกัน"}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={100}
          value={n}
          onChange={(e) => setN(clamp(Math.round(Number(e.target.value) || 1), 1, 100))}
          className="input tabular w-20 bg-surface"
          aria-label="จำนวน"
        />
        <span className="text-sm">{kind === "unit" ? "ห้อง" : "ชิ้น"}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-outline btn-sm bg-surface" onClick={() => onRepeat(n, "right")}>
          <ArrowRight className="size-3.5" /> ทางขวา
        </button>
        <button type="button" className="btn btn-outline btn-sm bg-surface" onClick={() => onRepeat(n, "down")}>
          <ArrowDown className="size-3.5" /> ด้านล่าง
        </button>
      </div>
    </div>
  );
}
