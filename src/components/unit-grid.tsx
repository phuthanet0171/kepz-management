import clsx from "clsx";
import Link from "next/link";
import type { UnitView } from "@/lib/types";

export function unitTileState(u: Pick<UnitView, "status" | "is_expiring">) {
  if (u.status === "occupied" && u.is_expiring) return "expiring" as const;
  return u.status;
}

const tileClass = {
  available: "border-ok/35 bg-surface text-ink hover:border-ok",
  occupied: "border-ink bg-ink text-white hover:bg-ink-2",
  expiring: "border-brand-strong bg-brand text-ink hover:bg-brand-strong",
  maintenance:
    "border-line bg-[repeating-linear-gradient(135deg,var(--color-canvas)_0_6px,var(--color-line)_6px_8px)] text-muted",
  inactive: "border-dashed border-line bg-surface text-muted/70",
};

const subLabel = {
  available: "ว่าง",
  occupied: "",
  expiring: "ใกล้หมดสัญญา",
  maintenance: "ปิดปรับปรุง",
  inactive: "ปิดใช้งาน",
};

export function UnitTile({ unit }: { unit: UnitView }) {
  const state = unitTileState(unit);
  return (
    <Link
      href={`/units/${unit.id}`}
      className={clsx(
        "flex min-h-[4.25rem] flex-col justify-between rounded-xl border-2 px-2.5 py-2 transition active:scale-[0.97]",
        tileClass[state],
      )}
      title={unit.tenant_name ?? subLabel[state]}
    >
      <span className="text-sm leading-tight font-bold">{unit.code}</span>
      <span className={clsx("truncate text-[11px] leading-tight", state === "available" && "text-ok")}>
        {state === "occupied" || state === "expiring" ? (unit.tenant_name ?? "") : subLabel[state]}
      </span>
    </Link>
  );
}

export function UnitGrid({ units }: { units: UnitView[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
      {units.map((u) => (
        <UnitTile key={u.id} unit={u} />
      ))}
    </div>
  );
}

export function UnitLegend() {
  const items = [
    { cls: "border-ok/50 bg-surface", label: "ว่าง" },
    { cls: "border-ink bg-ink", label: "มีผู้เช่า" },
    { cls: "border-brand-strong bg-brand", label: "ใกล้หมดสัญญา" },
    { cls: "border-line bg-line", label: "ปิดปรับปรุง" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={clsx("size-3 rounded border-2", i.cls)} />
          {i.label}
        </span>
      ))}
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
