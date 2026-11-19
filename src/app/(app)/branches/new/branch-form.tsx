"use client";

import { useState } from "react";
import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { baht } from "@/lib/format";
import type { UnitType } from "@/lib/types";
import { createBranch } from "../actions";
import { BranchPriceFields } from "../branch-price-fields";

function codeRange(prefix: string, n: number) {
  if (n <= 0) return null;
  const pad = (i: number) => `${prefix}-${String(i).padStart(Math.max(2, String(i).length), "0")}`;
  return n === 1 ? pad(1) : `${pad(1)} ถึง ${pad(n)}`;
}

export function NewBranchForm({ unitTypes }: { unitTypes: UnitType[] }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const total = Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(unitTypes.map((t) => [t.code, Number(t.default_monthly_price)])),
  );
  const monthly = unitTypes.reduce((a, t) => a + (counts[t.code] || 0) * (prices[t.code] ?? 0), 0);

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
          title="ราคา ขนาด และจำนวนห้อง"
          description="ราคาและขนาดใช้เฉพาะสาขานี้ แก้ภายหลังได้ที่หน้าสาขา → แก้ไข · ระบบสร้างรหัสห้องให้อัตโนมัติ ปรับชื่อห้องได้ในหน้าจัดผัง"
        />
        <BranchPriceFields
          unitTypes={unitTypes}
          onPrice={(code, v) => setPrices((p) => ({ ...p, [code]: v }))}
          onCount={(code, n) => setCounts((c) => ({ ...c, [code]: n }))}
          codeHint={(t) => codeRange(t.code_prefix, counts[t.code] || 0)}
        />
        <div className="flex items-center justify-between rounded-b-card border-t border-line bg-canvas/60 px-4 py-3 text-sm sm:px-5">
          <span className="text-muted">
            รวม <b className="tabular text-ink">{total}</b> ห้อง
          </span>
          <span className="text-muted">
            รายได้เต็มศักยภาพ <b className="tabular text-ink">{baht(monthly)}</b>/เดือน
          </span>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingText="กำลังสร้างสาขา…" className="btn btn-primary w-full sm:w-auto">
          สร้างสาขา {total > 0 && `(${total} ห้อง)`}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
