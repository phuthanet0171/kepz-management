import clsx from "clsx";
import Link from "next/link";
import type { UnitView } from "@/lib/types";
import { OverdueBadge } from "./floor-plan/viewer";

export function unitTileState(u: Pick<UnitView, "status" | "is_expiring">) {
  if (u.status === "occupied" && u.is_expiring) return "expiring" as const;
  return u.status;
}

const tileClass = {
  available: "border-ok bg-ok-soft text-ink hover:brightness-95",
  occupied: "border-ink bg-ink text-white hover:bg-ink-2",
  overdue: "border-bad bg-bad text-white hover:brightness-95",
  expiring: "border-brand-strong bg-brand text-ink hover:bg-brand-strong",
  maintenance: "border-muted/40 bg-line text-muted",
  inactive: "border-dashed border-line bg-surface text-muted/70",
};

const subLabel = {
  available: "ว่าง",
  occupied: "",
  expiring: "ใกล้หมดสัญญา",
  overdue: "ค้างชำระเกินกำหนด",
  maintenance: "ปิดปรับปรุง",
  inactive: "ปิดใช้งาน",
};

export function UnitTile({ unit, overdue }: { unit: UnitView; overdue?: boolean }) {
  const base = unitTileState(unit);
  const state = overdue && unit.status === "occupied" ? "overdue" : base;
  return (
    <Link
      href={`/units/${unit.id}`}
      className={clsx(
        "relative flex min-h-[4.25rem] flex-col justify-between rounded-xl border-2 px-2.5 py-2 transition active:scale-[0.97]",
        tileClass[state],
      )}
      title={`${unit.tenant_name ?? subLabel[state]}${state === "overdue" ? " · ค้างชำระเกินกำหนด" : ""}`}
    >
      {state === "overdue" && <OverdueBadge size={20} className="absolute -top-2 -right-2" />}
      <span className="text-sm leading-snug font-bold">{unit.code}</span>
      <span className={clsx("truncate text-[11px] leading-snug", state === "available" && "text-ok")}>
        {state === "occupied" || state === "expiring" || state === "overdue" ? (unit.tenant_name ?? "") : subLabel[state]}
      </span>
    </Link>
  );
}

export function UnitGrid({ units, overdue }: { units: UnitView[]; overdue?: Set<string> }) {
  return (
    <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
      {units.map((u) => (
        <UnitTile key={u.id} unit={u} overdue={overdue?.has(u.id)} />
      ))}
    </div>
  );
}

export function UnitLegend({ withOverdue = false }: { withOverdue?: boolean }) {
  const items = [
    { cls: "border-ok bg-ok-soft", label: "ว่าง" },
    { cls: "border-ink bg-ink", label: "มีผู้เช่า" },
    { cls: "border-brand-strong bg-brand", label: "ใกล้หมดสัญญา" },
    { cls: "border-muted/40 bg-line", label: "ปิดปรับปรุง" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-3 rounded border-2", i.cls)} />
          {i.label}
        </span>
      ))}
      {withOverdue && (
        <span className="inline-flex items-center gap-1.5">
          <span className="flex size-3.5 items-center justify-center rounded bg-bad text-[10px] leading-none font-black text-white">!</span>
          ค้างชำระเกินกำหนด
        </span>
      )}
    </div>
  );
}

/** จัดกลุ่มห้องตามประเภท เรียงตามลำดับประเภทและรหัส */
export function groupByType(units: UnitView[]) {
  const groups = new Map<string, { code: string; name: string; sort: number; units: UnitView[] }>();
  for (const u of units) {
    const g = groups.get(u.unit_type_code) ?? { code: u.unit_type_code, name: u.unit_type_name, sort: u.type_sort, units: [] };
    g.units.push(u);
    groups.set(u.unit_type_code, g);
  }
  const collator = new Intl.Collator("th", { numeric: true });
  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((g) => ({ ...g, units: g.units.sort((a, b) => collator.compare(a.code, b.code)) }));
}
