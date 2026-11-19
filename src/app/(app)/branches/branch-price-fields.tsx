"use client";

import { Car, Package } from "lucide-react";
import type { UnitType } from "@/lib/types";

/**
 * ราคาและขนาดห้องแต่ละประเภทของสาขา (ใช้ทั้งตอนเพิ่มสาขาและแก้ไขสาขา)
 * ชื่อช่อง: price_<code>, size_<code> และ count_<code> เมื่อมี onCount
 */
export function BranchPriceFields({
  unitTypes,
  onPrice,
  onCount,
  codeHint,
}: {
  unitTypes: UnitType[];
  onPrice?: (code: string, price: number) => void;
  /** แสดงช่องจำนวนห้อง (หน้าเพิ่มสาขา) */
  onCount?: (code: string, n: number) => void;
  codeHint?: (t: UnitType) => string | null;
}) {
  return (
    <div className="divide-y divide-line">
      {unitTypes.map((t) => {
        const Icon = t.kind === "parking" ? Car : Package;
        const hint = codeHint?.(t);
        return (
          <div key={t.code} className="px-4 py-3.5 sm:px-5">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft">
                <Icon className="size-4" />
              </span>
              <span className="font-semibold">{t.name}</span>
              {hint && <span className="truncate text-xs text-muted">{hint}</span>}
            </div>
            <div className={onCount ? "grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.4fr_6rem]" : "grid grid-cols-2 gap-2"}>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">ราคา (บาท/เดือน)</span>
                <input
                  name={`price_${t.code}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={t.default_monthly_price}
                  onChange={(e) => onPrice?.(t.code, Number(e.target.value) || 0)}
                  className="input tabular"
                  aria-label={`ราคา${t.name}`}
                />
              </label>
              <label className={onCount ? "col-span-2 block sm:col-span-1 sm:row-start-1 sm:col-start-2" : "block"}>
                <span className="mb-1 block text-xs text-muted">ขนาด / รายละเอียด</span>
                <input
                  name={`size_${t.code}`}
                  maxLength={60}
                  defaultValue={t.size_label ?? ""}
                  placeholder="เช่น 1.5 × 1 ม."
                  className="input"
                  aria-label={`ขนาด${t.name}`}
                />
              </label>
              {onCount && (
                <label className="col-start-2 row-start-1 block sm:col-start-3">
                  <span className="mb-1 block text-xs text-muted">จำนวน</span>
                  <input
                    name={`count_${t.code}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    step={1}
                    placeholder="0"
                    onChange={(e) => onCount(t.code, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="input tabular text-right"
                    aria-label={`จำนวน${t.name}`}
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
