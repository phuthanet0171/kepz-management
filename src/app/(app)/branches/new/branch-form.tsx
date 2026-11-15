"use client";

import { Car, Package } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { baht } from "@/lib/format";
import type { UnitType } from "@/lib/types";
import { createBranch } from "../actions";

function codeRange(prefix: string, n: number) {
  if (n <= 0) return null;
  const pad = (i: number) => `${prefix}-${String(i).padStart(Math.max(2, String(i).length), "0")}`;
  return n === 1 ? pad(1) : `${pad(1)} ถึง ${pad(n)}`;
}

export function NewBranchForm({ unitTypes }: { unitTypes: UnitType[] }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const total = Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const monthly = unitTypes.reduce((a, t) => a + (counts[t.code] || 0) * Number(t.default_monthly_price), 0);

  return (
    <ActionForm action={createBranch} className="space-y-5">
      <Card>
        <CardHeader title="ข้อมูลสาขา" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="ชื่อสาขา" required className="sm:col-span-2">
            <input name="name" required maxLength={100} className="input" placeholder="เช่น Kepz รามอินทรา" />
          </Field>
          <Field label="ที่อยู่" className="sm:col-span-2">
            <textarea name="address" rows={2} className="input min-h-0" />
          </Field>
          <Field label="เบอร์โทรสาขา">
            <input name="phone" type="tel" inputMode="tel" className="input" />
          </Field>
          <Field label="หมายเหตุ">
            <input name="note" className="input" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="จำนวนห้องและที่จอด"
          description="ระบบจะสร้างรหัสให้อัตโนมัติ และแก้ไขรหัสแต่ละห้องให้ตรงป้ายจริงได้ภายหลัง"
        />
        <div className="divide-y divide-line">
          {unitTypes.map((t) => {
            const n = counts[t.code] || 0;
            const Icon = t.kind === "parking" ? Car : Package;
            return (
              <div key={t.code} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted">
                    {baht(t.default_monthly_price)}/เดือน
                    {n > 0 && <> · {codeRange(t.code_prefix, n)}</>}
                  </div>
                </div>
                <input
                  name={`count_${t.code}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={500}
                  step={1}
                  placeholder="0"
                  aria-label={`จำนวน${t.name}`}
                  className="input tabular w-24 text-right"
                  onChange={(e) => setCounts((c) => ({ ...c, [t.code]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between rounded-b-card border-t border-line bg-canvas/60 px-4 py-3 text-sm sm:px-5">
          <span className="text-muted">
            รวม <b className="tabular text-ink">{total}</b> หน่วย
          </span>
          <span className="text-muted">
            รายได้เต็มศักยภาพ <b className="tabular text-ink">{baht(monthly)}</b>/เดือน
          </span>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingText="กำลังสร้างสาขา…" className="btn btn-primary w-full sm:w-auto">
          สร้างสาขา {total > 0 && `(${total} หน่วย)`}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
