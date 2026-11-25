"use client";

import clsx from "clsx";
import {
  Ban,
  Check,
  Circle,
  Copy,
  ExternalLink,
  LayoutGrid,
  Minus,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Save,
  SlidersHorizontal,
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import {
  BASE_CELL,
  colorStyle,
  defaultBox,
  defaultUnitColor,
  findFreeSpot,
  gridBackground,
  overlaps,
  labelStyle,
  PLAN_COLORS,
  TILE_LABEL,
  tileState,
  type Rect,
} from "@/components/floor-plan/shared";
import type { FloorPlan, Placement, PlanColor, PlanObject, PlanShape, PlanUnit, UnitType } from "@/lib/types";
import { usePinchZoom, ZoomBar } from "@/components/floor-plan/zoom-controls";
import { saveFloorPlan } from "./actions";

/**
 * ทุกอย่างบนผังคือ "รูป" (สี่เหลี่ยม/วงกลม) ที่มีชื่อและสี
 * use = รหัสประเภทห้อง → เป็นห้องเช่า/ที่จอดจริง · use = "" → ไม่ใช่ห้องเช่า (ทางเดิน ทางเข้า ป้าย)
 */
type Item = Rect & { shape: PlanShape; color: PlanColor; name: string; use: string };

type Doc = { name: string; cols: number; rows: number; items: Record<string, Item> };

type Drag =
  | { kind: "move" | "resize"; id: string; startX: number; startY: number; orig: Item; before: Doc; moved: boolean }
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
    };

const uid = () => crypto.randomUUID();
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm = (c: string) => c.trim().toUpperCase();

function canon(d: Doc) {
  return JSON.stringify([
    d.name,
    d.cols,
    d.rows,
    Object.keys(d.items)
      .sort()
      .map((k) => [k, d.items[k]]),
  ]);
}

/** รหัสถัดไปแบบ PREFIX-01 ที่ยังไม่ถูกใช้ */
function nextCode(prefix: string, used: Set<string>) {
  const p = prefix.toUpperCase();
  const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let max = 0;
  for (const c of used) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`${p}-${String(n).padStart(2, "0")}`)) n++;
  return `${p}-${String(n).padStart(2, "0")}`;
}

/** ชื่อถัดไปจากชื่อที่ลงท้ายด้วยตัวเลข เช่น M1 → M2, A-09 → A-10 */
function successor(code: string, used: Set<string>, fallback: () => string) {
  const m = /^(.*?)(\d+)$/.exec(code.trim());
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
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const typeByCode = useMemo(() => new Map(unitTypes.map((t) => [t.code, t])), [unitTypes]);

  const initial = useMemo<Doc>(() => {
    const items: Doc["items"] = {};
    for (const p of placements) {
      const u = unitById.get(p.unit_id);
      if (!u) continue;
      items[p.unit_id] = {
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        shape: p.shape ?? "rect",
        color: p.color ?? defaultUnitColor(u.unit_type_code),
        name: u.code,
        use: u.unit_type_code,
      };
    }
    for (const o of objects)
      items[o.id] = { x: o.x, y: o.y, w: o.w, h: o.h, shape: o.shape, color: o.color, name: o.label, use: "" };
    return { name: plan.name, cols: plan.cols, rows: plan.rows, items };
  }, [plan, placements, objects, unitById]);

  const [doc, setDocState] = useState<Doc>(initial);
  const docRef = useRef(doc);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  // มือถือ: แผงที่เด้งจากด้านล่าง (แก้รูปที่เลือก / ตัวเลือกผัง)
  const [sheet, setSheet] = useState<null | "item" | "plan">(null);
  const [pending, setPending] = useState<string | null>(null); // ห้องในระบบจากแถบข้างที่รอแตะตำแหน่งวาง
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomFitted = useRef(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [resync, setResync] = useState(false);
  const [focusName, setFocusName] = useState(0);
  // ค่าที่ใช้ล่าสุด ใช้กับรูปถัดไปที่เพิ่ม
  const [lastUse, setLastUse] = useState(() => unitTypes.find((t) => t.kind === "storage")?.code ?? unitTypes[0]?.code ?? "");
  const [lastColor, setLastColor] = useState<PlanColor | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // มือถือ/แท็บเล็ต: เปิดมาให้ซูมพอดีส่วนที่มีห้อง (ไม่ต้องเลื่อนหาห้องเล็กๆ ในผังใหญ่)
  const fitToContent = () => {
    const el = scrollRef.current;
    const list = Object.values(docRef.current.items);
    if (!el || !list.length) return;
    const maxX = Math.max(...list.map((b) => b.x + b.w)) + 1;
    setZoom(Math.round(Math.min(1.6, Math.max(0.8, el.clientWidth / (maxX * BASE_CELL))) * 10) / 10);
  };
  useLayoutEffect(() => {
    if (zoomFitted.current || window.innerWidth >= 1024) return;
    zoomFitted.current = true;
    fitToContent();
  }, []);

  // มือถือ: ผังสูงพอดีพื้นที่ที่เหลือระหว่างหัวหน้ากับแถบซูม + แถบปุ่มล่าง (ไม่ต้องเลื่อนทั้งหน้า)
  const zoomBarRef = useRef<HTMLDivElement>(null);
  const [mobileH, setMobileH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const calc = () => {
      const sc = scrollRef.current;
      if (window.innerWidth >= 1024 || !sc) return setMobileH(null);
      const top = sc.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector("[data-editor-bar]")?.getBoundingClientRect().height ?? 64;
      const zb = (zoomBarRef.current?.offsetHeight ?? 36) + 8;
      setMobileH(Math.max(240, Math.round(window.innerHeight - top - bar - zb - 8)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

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
  /** เปลี่ยนระหว่างลาก (เก็บประวัติตอนปล่อย) */
  const live = useCallback((fn: (d: Doc) => Doc) => {
    const n = fn(docRef.current);
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

  // โฟกัสช่องชื่อทันทีหลังเพิ่มรูปใหม่ พิมพ์ชื่อได้เลย
  useEffect(() => {
    // มือถือไม่เปิดคีย์บอร์ดเอง (จะบังผัง) แตะช่องชื่อเมื่อต้องการแก้
    if (!focusName || window.innerWidth < 1024) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [focusName]);

  // มือถือ: เปิดแผงแก้ไขแล้ว เลื่อนผังข้างในให้รูปที่เลือกอยู่เหนือแผง
  useEffect(() => {
    if (!sel || sheet !== "item" || window.innerWidth >= 1024) return;
    const id = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-item="${sel}"]`);
      const sc = scrollRef.current;
      if (!el || !sc) return;
      const sr = sc.getBoundingClientRect();
      const sheetTop = document.querySelector("aside")?.getBoundingClientRect().top ?? window.innerHeight * 0.5;
      const visibleBottom = Math.min(sr.bottom, sheetTop);
      const er = el.getBoundingClientRect();
      sc.scrollLeft += er.left + er.width / 2 - (sr.left + sr.width / 2);
      sc.scrollTop += er.top - (sr.top + Math.max(8, (visibleBottom - sr.top - er.height) / 2));
    }, 60);
    return () => clearTimeout(id);
  }, [sel, sheet]);

  // ไม่มีรูปที่เลือก = ปิดแผงแก้ไข
  if (!sel && sheet === "item") setSheet(null);

  // ใช้สองนิ้วซูม: ถ้าเริ่มบีบระหว่างลากห้อง ให้ยกเลิกการลากนั้น (ห้องกลับที่เดิม)
  const dragRef = useRef<Drag | null>(null);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  usePinchZoom(scrollRef, zoom, setZoom, {
    min: 0.4,
    max: 2.5,
    onPinchStart: () => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind !== "new") {
        docRef.current = d.before;
        setDocState(d.before);
      }
      setDrag(null);
    },
  });

  const { name, cols, rows, items } = doc;
  const cell = BASE_CELL * zoom;
  const dirty = useMemo(() => canon(doc) !== canon(initial), [doc, initial]);
  const isRental = (it: Item) => it.use !== "";
  const isExisting = (id: string) => unitById.has(id);

  /** ชื่อห้องเช่าทั้งหมดของสาขา (ห้องบนผังนี้ใช้ชื่อในผัง) */
  const usedCodes = useCallback(
    (d: Doc) => {
      const s = new Set<string>();
      for (const u of units) if (!d.items[u.id]) s.add(norm(u.code));
      for (const it of Object.values(d.items)) if (it.use) s.add(norm(it.name));
      return s;
    },
    [units],
  );

  const dupCodes = useMemo(() => {
    const count = new Map<string, number>();
    for (const u of units) if (!items[u.id]) count.set(norm(u.code), (count.get(norm(u.code)) ?? 0) + 1);
    for (const it of Object.values(items)) if (it.use) count.set(norm(it.name), (count.get(norm(it.name)) ?? 0) + 1);
    return new Set([...count].filter(([c, n]) => n > 1 || !c).map(([c]) => c));
  }, [items, units]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const overlapping = useMemo(() => {
    const rental = Object.entries(items).filter(([, it]) => it.use);
    const bad = new Set<string>();
    for (let i = 0; i < rental.length; i++)
      for (let j = i + 1; j < rental.length; j++)
        if (overlaps(rental[i][1], rental[j][1])) {
          bad.add(rental[i][0]);
          bad.add(rental[j][0]);
        }
    return bad;
  }, [items]);

  const outOfBounds = useMemo(
    () =>
      new Set(
        Object.entries(items)
          .filter(([, b]) => b.x + b.w > cols || b.y + b.h > rows)
          .map(([id]) => id),
      ),
    [items, cols, rows],
  );

  const collator = useMemo(() => new Intl.Collator("th", { numeric: true }), []);
  const unplaced = useMemo(
    () =>
      units
        .filter((u) => !items[u.id] && !placedElsewhere[u.id] && u.status !== "inactive")
        .sort((a, b) => a.type_sort - b.type_sort || collator.compare(a.code, b.code)),
    [units, items, placedElsewhere, collator],
  );
  const elsewhereCount = units.filter((u) => !items[u.id] && placedElsewhere[u.id]).length;

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

  const fitAt = useCallback(
    (w: number, h: number, cx: number, cy: number) => {
      const ww = clamp(w, 1, cols);
      const hh = clamp(h, 1, rows);
      return { x: clamp(Math.round(cx - ww / 2), 0, cols - ww), y: clamp(Math.round(cy - hh / 2), 0, rows - hh), w: ww, h: hh };
    },
    [cols, rows],
  );

  /** วางห้องที่มีอยู่แล้วในระบบลงบนผัง */
  const placeExisting = useCallback(
    (id: string, cx: number, cy: number) => {
      const u = unitById.get(id);
      if (!u) return;
      const { w, h } = defaultBox(u.unit_type_code);
      commit((d) => ({
        ...d,
        items: {
          ...d.items,
          [id]: {
            ...fitAt(w, h, cx, cy),
            shape: "rect",
            color: defaultUnitColor(u.unit_type_code),
            name: u.code,
            use: u.unit_type_code,
          },
        },
      }));
      setSel(id);
      setPending(null);
    },
    [unitById, commit, fitAt],
  );

  /** กดปุ่ม ▢ / ◯ : เพิ่มรูปกลางจอที่มองเห็นทันที */
  function addShape(shape: PlanShape) {
    const d = docRef.current;
    const type = typeByCode.get(lastUse);
    let { w, h } = type ? defaultBox(type.code) : { w: 3, h: 3 };
    if (shape === "circle") w = h = Math.max(w, h);
    const sc = scrollRef.current;
    const cx = sc ? (sc.scrollLeft + Math.min(sc.clientWidth, d.cols * cell) / 2) / cell : d.cols / 2;
    const cy = sc ? (sc.scrollTop + Math.min(sc.clientHeight, d.rows * cell) / 2) / cell : d.rows / 2;
    let box = fitAt(w, h, cx, cy);
    const rental = Object.values(d.items).filter(isRental);
    if (type && rental.some((r) => overlaps(r, box))) {
      box =
        findFreeSpot(rental, box.w, box.h, d.cols, d.rows, {
          x: Math.max(0, Math.floor(cx - w)),
          y: Math.max(0, Math.floor(cy - h)),
        }) ??
        findFreeSpot(rental, box.w, box.h, d.cols, d.rows) ??
        box;
    }
    const id = uid();
    const used = usedCodes(d);
    commit((dd) => ({
      ...dd,
      items: {
        ...dd.items,
        [id]: {
          ...box,
          shape,
          color: lastColor ?? (type ? defaultUnitColor(type.code) : "gray"),
          name: type ? nextCode(type.code_prefix, used) : "",
          use: type?.code ?? "",
        },
      },
    }));
    setSel(id);
    setPending(null);
    setSheet("item"); // มือถือ: เปิดแผงให้ตั้งชื่อ สี ประเภททันที
    setFocusName((n) => n + 1);
  }

  // ลาก: ย้าย / ปรับขนาด / ลากห้องจากแถบข้าง (รองรับเมาส์และนิ้วบนแท็บเล็ต)
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4;
      if (drag.kind === "new") {
        setDrag({ ...drag, clientX: e.clientX, clientY: e.clientY, moved });
        return;
      }
      const dx = Math.round((e.clientX - drag.startX) / cell);
      const dy = Math.round((e.clientY - drag.startY) / cell);
      const o = drag.orig;
      const next =
        drag.kind === "move"
          ? { x: clamp(o.x + dx, 0, cols - o.w), y: clamp(o.y + dy, 0, rows - o.h), w: o.w, h: o.h }
          : { x: o.x, y: o.y, w: clamp(o.w + dx, 1, cols - o.x), h: clamp(o.h + dy, 1, rows - o.y) };
      live((d) => {
        const cur = d.items[drag.id];
        if (!cur || (cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h)) return d;
        return { ...d, items: { ...d.items, [drag.id]: { ...cur, ...next } } };
      });
      if (moved !== drag.moved) setDrag({ ...drag, moved });
    };
    const onUp = (e: PointerEvent) => {
      if (drag.kind === "new") {
        const { cx, cy, inside } = cellFromClient(e.clientX, e.clientY);
        if (drag.moved && inside) placeExisting(drag.id, cx, cy);
        else if (!drag.moved) {
          setPending((p) => (p === drag.id ? null : drag.id));
          setSheet(null); // มือถือ: ปิดแผงให้แตะตำแหน่งบนผังได้
        }
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
  }, [drag, cell, cols, rows, cellFromClient, placeExisting, live]);

  function undo() {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [docRef.current, ...f]);
    docRef.current = prev;
    setDocState(prev);
    setSel((s) => (s && prev.items[s] ? s : null));
  }
  function redo() {
    if (!future.length) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, docRef.current]);
    docRef.current = next;
    setDocState(next);
    setSel((s) => (s && next.items[s] ? s : null));
  }

  const selItem = sel ? (items[sel] ?? null) : null;
  const selUnit = sel ? unitById.get(sel) : undefined;
  const selLocked = !!selUnit && selUnit.status === "occupied"; // มีผู้เช่า เปลี่ยนประเภทไม่ได้

  function patchSel(p: Partial<Item>) {
    if (!sel) return;
    const id = sel;
    commit((d) => {
      const o = d.items[id];
      if (!o) return d;
      const n = { ...o, ...p };
      n.w = clamp(n.w || 1, 1, d.cols - n.x);
      n.h = clamp(n.h || 1, 1, d.rows - n.y);
      return { ...d, items: { ...d.items, [id]: n } };
    });
  }

  function setUse(use: string) {
    if (!sel || !selItem) return;
    const t = typeByCode.get(use);
    const p: Partial<Item> = { use };
    // เปลี่ยนจาก "ไม่ใช่ห้องเช่า" เป็นห้อง: ตั้งชื่อรหัสให้ถ้ายังไม่มีชื่อ
    if (t && !selItem.use && !selItem.name.trim()) p.name = nextCode(t.code_prefix, usedCodes(docRef.current));
    if (!t && selItem.color === "none") p.color = "gray";
    patchSel(p);
    setLastUse(use);
  }

  function rotateSel() {
    if (!selItem) return;
    const w = Math.min(selItem.h, cols);
    const h = Math.min(selItem.w, rows);
    patchSel({ w, h, x: Math.min(selItem.x, cols - w), y: Math.min(selItem.y, rows - h) });
  }

  function removeSel() {
    if (!sel) return;
    const id = sel;
    commit((d) => {
      const n = { ...d.items };
      delete n[id];
      return { ...d, items: n };
    });
    setSel(null);
  }

  /** สร้างสำเนาของรูปที่เลือกที่ตำแหน่ง box (ห้องเช่าจะรันชื่อต่อให้) */
  function cloneAt(src: Item, box: Rect, used: Set<string>): Item {
    if (!src.use) return { ...src, ...box };
    const prefix = typeByCode.get(src.use)?.code_prefix ?? "R";
    const code = successor(src.name, used, () => nextCode(prefix, used));
    used.add(norm(code));
    return { ...src, ...box, name: code };
  }

  function duplicateSel() {
    if (!sel || !selItem) return;
    const d0 = docRef.current;
    const rental = selItem.use ? Object.values(d0.items).filter(isRental) : [];
    const free = (r: Rect) => r.x + r.w <= d0.cols && r.y + r.h <= d0.rows && !rental.some((o) => overlaps(o, r));
    const cands = [
      { x: selItem.x + selItem.w, y: selItem.y, w: selItem.w, h: selItem.h },
      { x: selItem.x, y: selItem.y + selItem.h, w: selItem.w, h: selItem.h },
    ];
    const spot =
      cands.find(free) ??
      (selItem.use
        ? findFreeSpot(rental, selItem.w, selItem.h, d0.cols, d0.rows)
        : {
            x: Math.min(selItem.x + 1, d0.cols - selItem.w),
            y: Math.min(selItem.y + 1, d0.rows - selItem.h),
            w: selItem.w,
            h: selItem.h,
          });
    if (!spot) {
      setMessage({ tone: "bad", text: "ไม่มีที่ว่างบนผัง ขยายขนาดผังก่อน" });
      return;
    }
    const id = uid();
    const item = cloneAt(selItem, spot, usedCodes(d0));
    commit((d) => ({ ...d, items: { ...d.items, [id]: item } }));
    setSel(id);
  }

  function autoArrange() {
    const rects: Rect[] = Object.values(items).filter(isRental);
    const added: Doc["items"] = {};
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
      added[u.id] = { ...spot, shape: "rect", color: defaultUnitColor(u.unit_type_code), name: u.code, use: u.unit_type_code };
      cursor = { x: spot.x + spot.w, y: spot.y };
    }
    commit((d) => ({ ...d, items: { ...d.items, ...added } }));
  }

  // แป้นพิมพ์
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setPending(null);
        setSel(null);
        return;
      }
      if (!selItem) return;
      if (mod && k === "d") {
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
          x: clamp(selItem.x + mv[e.key][0], 0, cols - selItem.w),
          y: clamp(selItem.y + mv[e.key][1], 0, rows - selItem.h),
        });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSel();
      } else if (k === "r") {
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
      setMessage({ tone: "bad", text: "มีรูปเกินขอบผัง กรุณาขยายขนาดผังหรือย้ายเข้ามา" });
      return;
    }
    if (dupCodes.size) {
      const names = [...dupCodes].filter(Boolean);
      setMessage({
        tone: "bad",
        text: names.length ? `ชื่อห้องซ้ำกัน: ${names.join(", ")} กรุณาเปลี่ยนชื่อให้ไม่ซ้ำ` : "มีห้องที่ยังไม่ได้ตั้งชื่อ",
      });
      return;
    }
    const entries = Object.entries(items);
    const rental = entries.filter(([, it]) => it.use);
    startSaving(async () => {
      const res = await saveFloorPlan({
        planId: plan.id,
        name,
        cols,
        rows,
        placements: rental.map(([unit_id, b]) => ({ unit_id, x: b.x, y: b.y, w: b.w, h: b.h, shape: b.shape, color: b.color })),
        objects: entries
          .filter(([, it]) => !it.use)
          .map(([id, o]) => ({ id, label: o.name.trim(), shape: o.shape, color: o.color, x: o.x, y: o.y, w: o.w, h: o.h })),
        newUnits: rental
          .filter(([id]) => !isExisting(id))
          .map(([id, it]) => ({ id, code: norm(it.name), unit_type_code: it.use })),
        renames: rental
          .filter(([id, it]) => {
            const u = unitById.get(id);
            return u && (norm(it.name) !== norm(u.code) || it.use !== u.unit_type_code);
          })
          .map(([id, it]) => ({ id, code: norm(it.name), unit_type_code: it.use })),
      });
      if (res?.error) setMessage({ tone: "bad", text: res.error });
      else {
        setMessage({ tone: "ok", text: res?.message ?? "บันทึกผังแล้ว" });
        setResync(true);
        router.refresh();
      }
    });
  }

  const ghost = drag?.kind === "new" && drag.moved ? drag : null;
  const ghostUnit = ghost ? unitById.get(ghost.id) : null;
  const newCount = Object.entries(items).filter(([id, it]) => it.use && !isExisting(id)).length;
  // ห้องเช่าอยู่ด้านบน รูปอื่น (ทางเดิน ป้าย) อยู่ด้านล่าง
  const ordered = Object.entries(items).sort((a, b) => Number(!!a[1].use) - Number(!!b[1].use));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
      {/* แผงซ้าย: รายละเอียดรูปที่เลือก หรือ ตั้งค่าผัง */}
      {/* มือถือ: แถบเครื่องมือ + ผังขึ้นก่อน แผงรายละเอียดอยู่ใต้ผัง */}
      <aside
        className={clsx(
          "card flex flex-col overflow-hidden max-lg:order-2 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)]",
          // มือถือ: ซ่อนไว้ แสดงเป็นแผงเด้งจากด้านล่างเมื่อกด "แก้ไข" หรือ "ตัวเลือก"
          (sheet === "item" && sel && selItem) || (sheet === "plan" && !sel)
            ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[50dvh] max-lg:rounded-none max-lg:rounded-t-3xl max-lg:border-0 max-lg:border-t-2 max-lg:border-brand max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-12px_40px_rgb(0_0_0/0.25)]"
            : "max-lg:hidden",
        )}
      >
        {sel && selItem ? (
          <>
            <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {selItem.use ? (isExisting(sel) ? "ห้องในระบบ" : "ห้องใหม่") : "รูปตกแต่ง"}
                </div>
                <div className="text-xs text-muted">
                  {!selItem.use
                    ? "ไม่ใช่ห้องเช่า เช่น ทางเดิน ทางเข้า ป้ายโซน"
                    : selUnit
                      ? (selUnit.tenant_name ?? TILE_LABEL[tileState(selUnit)])
                      : "กด “บันทึกผัง” แล้วพร้อมทำสัญญาทันที"}
                </div>
              </div>
              <button type="button" className="btn btn-brand btn-sm shrink-0 lg:hidden" onClick={() => setSheet(null)}>
                เสร็จ
              </button>
              <button
                type="button"
                className="btn btn-ghost size-9 min-h-0 shrink-0 p-0 max-lg:hidden"
                onClick={() => setSel(null)}
                aria-label="ปิด"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <label className="block">
                <span className="label">{selItem.use ? "ชื่อห้อง (ใช้ในสัญญาและใบวางบิล)" : "ชื่อ / ข้อความ"}</span>
                <input
                  ref={nameRef}
                  value={selItem.name}
                  onChange={(e) => patchSel({ name: e.target.value.slice(0, selItem.use ? 20 : 40) })}
                  placeholder={selItem.use ? "เช่น M1" : "เช่น ทางเดิน, ทางเข้า, โซน A"}
                  className={clsx(
                    "input",
                    selItem.use && "uppercase",
                    selItem.use && dupCodes.has(norm(selItem.name)) && "border-bad",
                  )}
                />
                {selItem.use && dupCodes.has(norm(selItem.name)) && (
                  <span className="mt-1 block text-xs text-bad">{selItem.name.trim() ? "ชื่อนี้ซ้ำกับห้องอื่น" : "กรุณาตั้งชื่อห้อง"}</span>
                )}
              </label>

              <div>
                <span className="label">สี</span>
                <div className="grid grid-cols-6 gap-2">
                  {PLAN_COLORS.filter((c) => c.key !== "none" || !selItem.use).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      aria-pressed={selItem.color === c.key}
                      onClick={() => {
                        patchSel({ color: c.key });
                        if (c.key !== "none") setLastColor(c.key);
                      }}
                      className={clsx(
                        "aspect-square w-full rounded-full border-2 transition",
                        selItem.color === c.key ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110",
                        c.key === "none" && "bg-[repeating-linear-gradient(45deg,#fff_0_4px,#e5e7eb_4px_6px)]",
                      )}
                      style={c.key === "none" ? { borderColor: "#cfcfcf" } : { background: c.fill, borderColor: c.border }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span className="label">ใช้เป็น</span>
                <div className="flex flex-wrap gap-1.5">
                  {unitTypes.map((t) => (
                    <Chip key={t.code} active={selItem.use === t.code} disabled={selLocked} onClick={() => setUse(t.code)}>
                      {t.name}
                    </Chip>
                  ))}
                  <Chip active={!selItem.use} disabled={isExisting(sel)} onClick={() => setUse("")}>
                    <Ban className="size-3.5" /> ไม่ใช่ห้องเช่า
                  </Chip>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {selLocked
                    ? "ห้องนี้มีผู้เช่าอยู่ เปลี่ยนประเภทไม่ได้"
                    : selItem.use
                      ? `ราคาของสาขานี้ ${typeByCode.get(selItem.use)?.default_monthly_price.toLocaleString() ?? "-"} บาท/เดือน`
                      : "ใช้วาดทางเดิน ทางเข้า ลิฟต์ เสา หรือป้ายโซน วางทับห้องได้"}
                </p>
                {selUnit && (
                  <Link
                    href={`/units/${selUnit.id}`}
                    target="_blank"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-ink-2 underline"
                  >
                    <ExternalLink className="size-3" /> เปิดหน้าห้อง (ราคา สถานะ ผู้เช่า)
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <Segmented
                  label="รูปทรง"
                  value={selItem.shape}
                  onChange={(shape) => patchSel({ shape })}
                  options={[
                    { value: "rect", label: "สี่เหลี่ยม", icon: <Square className="size-4" /> },
                    { value: "circle", label: "วงกลม", icon: <Circle className="size-4" /> },
                  ]}
                />
                <button
                  type="button"
                  className="btn btn-outline size-11 p-0"
                  onClick={rotateSel}
                  title="หมุน (R)"
                  aria-label="หมุน"
                >
                  <RotateCw className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-line pt-4">
                <button type="button" className="btn btn-outline" onClick={duplicateSel} title="Ctrl+D">
                  <Copy className="size-4" /> ทำซ้ำ
                </button>
                <button type="button" className="btn btn-danger" onClick={removeSel} title="Delete">
                  <Trash2 className="size-4" /> {isExisting(sel) ? "เอาออกจากผัง" : "ลบ"}
                </button>
              </div>
              {isExisting(sel) && (
                <p className="text-xs text-muted">ห้องและสัญญายังอยู่ในระบบ ย้ายไปอยู่ในรายการ “ห้องในระบบที่ยังไม่อยู่บนผัง”</p>
              )}
            </div>
          </>
        ) : (
          <>
            <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 lg:hidden">
              <div className="font-semibold">ตัวเลือกผัง</div>
              <button type="button" className="btn btn-brand btn-sm" onClick={() => setSheet(null)}>
                เสร็จ
              </button>
            </div>
            <div className="flex gap-2 border-b border-line p-4 lg:hidden">
              <button type="button" className="btn btn-outline flex-1" onClick={redo} disabled={!future.length}>
                <Redo2 className="size-4" /> ทำซ้ำ
              </button>
              <button
                type="button"
                className="btn btn-outline flex-1"
                disabled={!dirty}
                onClick={() => {
                  commit(() => initial);
                  setSheet(null);
                  setMessage(null);
                }}
              >
                <Undo2 className="size-4" /> ยกเลิกที่แก้
              </button>
            </div>
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
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl bg-brand-soft p-3 text-sm">
                <div className="font-semibold">วิธีใช้</div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-ink-2">
                  <li>
                    กด <b>สี่เหลี่ยม</b> หรือ <b>วงกลม</b> ด้านบน
                  </li>
                  <li>พิมพ์ชื่อ เลือกสี และเลือกว่าใช้เป็นห้องอะไร</li>
                  <li>ลากไปวาง ลากมุมขวาล่างเพื่อปรับขนาด</li>
                  <li>
                    กด <b>บันทึกผัง</b>
                  </li>
                </ol>
              </div>

              {unplaced.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-semibold">ห้องในระบบที่ยังไม่อยู่บนผัง ({unplaced.length})</div>
                  <p className="mb-2 text-xs text-muted">ลากลงบนผัง หรือแตะห้องแล้วแตะตำแหน่ง</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unplaced.map((u) => (
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
                        {u.code}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-outline btn-sm mt-3 w-full" onClick={autoArrange}>
                    <LayoutGrid className="size-3.5" /> วางทั้งหมดอัตโนมัติ
                  </button>
                </div>
              )}
              {elsewhereCount > 0 && (
                <p className="mt-4 text-xs text-muted">อีก {elsewhereCount} ห้องอยู่ในชั้น/โซนอื่น ถ้าต้องการย้ายมาที่นี่ ให้เอาออกจากผังเดิมก่อน</p>
              )}
            </div>
          </>
        )}
      </aside>
      {/* มือถือ: พื้นหลังมืดเมื่อเปิดแผง แตะเพื่อปิด */}
      {(sheet === "item" && sel && selItem) || (sheet === "plan" && !sel) ? (
        <div aria-hidden className="fixed inset-0 z-40 bg-ink/25 lg:hidden" onClick={() => setSheet(null)} />
      ) : null}

      <div className="min-w-0 space-y-3 max-lg:order-1">
        {/* แถบเครื่องมือ */}
        <div className="card z-20 flex flex-wrap items-center gap-2 p-2.5 max-lg:hidden">
          <button type="button" className="btn btn-primary max-sm:flex-1" onClick={() => addShape("rect")}>
            <Square className="size-4" /> สี่เหลี่ยม
          </button>
          <button type="button" className="btn btn-primary max-sm:flex-1" onClick={() => addShape("circle")}>
            <Circle className="size-4" /> วงกลม
          </button>
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
          <button
            type="button"
            className="btn btn-ghost size-11 p-0"
            aria-label="ย่อ"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
          >
            <Minus className="size-4" />
          </button>
          <span className="tabular w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="btn btn-ghost size-11 p-0"
            aria-label="ขยาย"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}
          >
            <Plus className="size-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            {dirty && (
              <button
                type="button"
                className="btn btn-ghost max-sm:hidden"
                onClick={() => {
                  commit(() => initial);
                  setSel(null);
                  setMessage(null);
                }}
              >
                ยกเลิกที่แก้
              </button>
            )}
            <button type="button" className="btn btn-brand" disabled={saving || resync || !dirty} onClick={save}>
              {saving ? <span className="size-4 animate-spin rounded-full border-2 border-current/25 border-t-current" /> : <Save className="size-4" />}
              {saving ? "กำลังบันทึก…" : dirty ? (newCount ? `บันทึกผัง (+${newCount} ห้องใหม่)` : "บันทึกผัง") : "บันทึกแล้ว"}
            </button>
          </div>
        </div>

        {message && (
          <div
            role="status"
            className={clsx(
              "flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm max-lg:fixed max-lg:inset-x-3 max-lg:bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:shadow-lg",
              message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad",
            )}
          >
            <span className="flex-1">{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="ปิด">
              <X className="size-4" />
            </button>
          </div>
        )}

        {pending && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm max-lg:fixed max-lg:inset-x-3 max-lg:bottom-[calc(5.25rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:shadow-lg">
            แตะตำแหน่งบนผังเพื่อวางห้อง <b>{unitById.get(pending)?.code}</b>
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setPending(null)}>
              ยกเลิก
            </button>
          </div>
        )}

        {/* ผัง (มือถือ: เต็มจอระหว่างหัวบนกับแถบปุ่มด้านล่าง) */}
        <div className="relative">
          <div
            ref={scrollRef}
            className="overflow-auto rounded-xl border border-line bg-surface max-lg:h-[calc(100dvh-15rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:max-h-[calc(100dvh-14rem)]"
            style={{ touchAction: "pan-x pan-y", ...(mobileH ? { height: mobileH } : {}) }}
          >
            <div
              ref={canvasRef}
              className={clsx("relative select-none", pending && "cursor-crosshair")}
              style={{ width: cols * cell, height: rows * cell, ...gridBackground(cell) }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (pending) {
                  const { cx, cy } = cellFromClient(e.clientX, e.clientY);
                  placeExisting(pending, cx, cy);
                } else setSel(null);
              }}
            >
              {ordered.map(([id, it]) => {
                const bad = overlapping.has(id) || outOfBounds.has(id) || (!!it.use && dupCodes.has(norm(it.name)));
                return (
                  <ItemBox
                    key={id}
                    id={id}
                    item={it}
                    cell={cell}
                    selected={sel === id}
                    bad={bad}
                    badge={it.use && !isExisting(id) ? "ใหม่" : undefined}
                    onPointerDown={(e) => {
                      setSel(id);
                      setPending(null);
                      setDrag({
                        kind: "move",
                        id,
                        startX: e.clientX,
                        startY: e.clientY,
                        orig: it,
                        before: docRef.current,
                        moved: false,
                      });
                    }}
                    onResizeDown={(e) =>
                      setDrag({
                        kind: "resize",
                        id,
                        startX: e.clientX,
                        startY: e.clientY,
                        orig: it,
                        before: docRef.current,
                        moved: false,
                      })
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
        {/* มือถือ: ซูมอยู่ใต้ผัง ไม่ลอยทับห้อง · ใช้สองนิ้วซูมได้ */}
        <div ref={zoomBarRef} className="lg:hidden">
          <ZoomBar
            zoom={zoom}
            hint={pending ? "แตะบนผังตรงที่จะวางห้อง" : sel ? "ลากย้าย · ลากมุมปรับขนาด" : "แตะห้องเพื่อเลือก · 2 นิ้วซูม"}
            onIn={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))}
            onOut={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1)))}
            onFit={fitToContent}
          />
        </div>
        <p className="text-xs text-muted max-lg:hidden">
          ลากเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับขนาด · ลูกศรขยับ (Shift = 5 ช่อง) · R หมุน · Ctrl+D ทำซ้ำ · Ctrl+Z ย้อนกลับ · Delete ลบ
        </p>
      </div>

      {/* มือถือ: แถบปุ่มติดด้านล่างจอ (แทนเมนูล่างของเว็บในหน้านี้) */}
      <nav
        data-editor-bar
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t-[3px] border-brand bg-ink pb-[env(safe-area-inset-bottom)] text-white lg:hidden"
      >
        {sel && selItem ? (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span
              className="mr-1 max-w-[6.5rem] min-w-0 truncate rounded-lg px-2 py-1 text-xs font-bold"
              style={colorStyle(selItem.color)}
            >
              {selItem.name || (selItem.use ? "ห้องใหม่" : "รูป")}
            </span>
            <BarButton icon={<Pencil className="size-5" />} label="แก้ไข" onClick={() => setSheet("item")} highlight />
            <BarButton icon={<Copy className="size-5" />} label="ทำซ้ำ" onClick={duplicateSel} />
            <BarButton icon={<RotateCw className="size-5" />} label="หมุน" onClick={rotateSel} />
            <BarButton
              icon={<Trash2 className="size-5" />}
              label={isExisting(sel) ? "เอาออก" : "ลบ"}
              onClick={removeSel}
              danger
            />
            <BarButton icon={<Check className="size-5" />} label="เสร็จ" onClick={() => setSel(null)} />
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <BarButton icon={<Square className="size-5" />} label="สี่เหลี่ยม" onClick={() => addShape("rect")} />
            <BarButton icon={<Circle className="size-5" />} label="วงกลม" onClick={() => addShape("circle")} />
            <BarButton icon={<Undo2 className="size-5" />} label="ย้อนกลับ" onClick={undo} disabled={!past.length} />
            <BarButton
              icon={<SlidersHorizontal className="size-5" />}
              label="ตัวเลือก"
              onClick={() => {
                setSel(null);
                setSheet("plan");
              }}
            />
            <button
              type="button"
              disabled={saving || resync || !dirty}
              onClick={save}
              className="ml-1 flex h-12 flex-[1.4] flex-col items-center justify-center rounded-xl bg-brand px-2 text-ink transition active:scale-95 disabled:bg-white/10 disabled:text-white/50"
            >
              {saving ? <span className="size-5 animate-spin rounded-full border-2 border-ink/25 border-t-ink" /> : <Save className="size-5" />}
              <span className="text-[11px] leading-tight font-bold whitespace-nowrap">
                {saving ? "กำลังบันทึก…" : dirty ? (newCount ? `บันทึก (+${newCount})` : "บันทึก") : "บันทึกแล้ว"}
              </span>
            </button>
          </div>
        )}
      </nav>

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
          {ghostUnit.code}
        </div>
      )}
    </div>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-medium transition active:scale-95 disabled:opacity-35",
        highlight ? "bg-white/10 text-brand" : danger ? "text-red-300" : "text-white/85",
      )}
    >
      {icon}
      <span className="leading-tight whitespace-nowrap">{label}</span>
    </button>
  );
}

function ItemBox({
  id,
  item,
  cell,
  selected,
  bad,
  badge,
  onPointerDown,
  onResizeDown,
}: {
  id: string;
  item: Item;
  cell: number;
  selected: boolean;
  bad: boolean;
  badge?: string;
  onPointerDown: (e: RPointerEvent) => void;
  onResizeDown: (e: RPointerEvent) => void;
}) {
  const textOnly = item.color === "none";
  return (
    <div
      data-item={id}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onPointerDown(e);
      }}
      className={clsx(
        "absolute flex cursor-grab flex-col items-center justify-center border-2 text-center leading-tight active:cursor-grabbing",
        item.shape === "circle" ? "rounded-full" : "rounded-md",
        item.use ? "z-[2]" : "z-[1]",
        textOnly && "!border-dashed !border-[#cfcfcf]",
        bad && "!border-bad ring-2 ring-bad/40",
        selected && "z-[5] ring-2 ring-ink ring-offset-2",
      )}
      style={{
        ...colorStyle(item.color),
        left: item.x * cell + 1,
        top: item.y * cell + 1,
        width: item.w * cell - 2,
        height: item.h * cell - 2,
        touchAction: "none",
      }}
    >
      <span
        className={clsx("max-w-full px-0.5", item.use ? "font-bold" : "font-semibold")}
        style={labelStyle(
          Math.max(9, Math.min(textOnly ? 20 : 16, cell * (textOnly ? 0.7 : 0.55))),
          item.h * cell - 2,
          badge && item.h * cell >= 44 ? 18 : 0,
        )}
      >
        {item.name || (item.use ? "" : "…")}
      </span>
      {badge && item.h * cell >= 44 && (
        <span className="rounded bg-white/80 px-1 text-[10px] leading-4 font-semibold text-ink">{badge}</span>
      )}
      {selected && (
        <span
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onResizeDown(e);
          }}
          className="absolute -right-3 -bottom-3 size-7 cursor-se-resize rounded-lg border-2 border-white bg-ink shadow lg:-right-2 lg:-bottom-2 lg:size-5 lg:rounded-md"
          style={{ touchAction: "none" }}
          aria-label="ลากเพื่อปรับขนาด"
        />
      )}
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled && !active}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        active ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/40",
      )}
    >
      {children}
    </button>
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
