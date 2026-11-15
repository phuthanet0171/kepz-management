"use client";

import { AlertTriangle, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { BILLING_CYCLE_LABEL, money, thDate } from "@/lib/format";
import type { BillingDue } from "@/lib/types";
import { createInvoicesBulk } from "./actions";

export function BulkBilling({ rows, today }: { rows: BillingDue[]; today: string }) {
  const selectable = rows.filter((r) => !r.is_partial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.contract_id));
  const total = rows
    .filter((r) => selected.has(r.contract_id))
    .reduce((a, r) => a + Number(r.monthly_rent) * r.months, 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ActionForm action={createInvoicesBulk} onSuccess={() => setSelected(new Set())} className="space-y-0">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-ink"
            checked={allChecked}
            disabled={selectable.length === 0}
            onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.contract_id)))}
          />
          เลือกทั้งหมด
        </label>
        <span className="text-xs text-muted">ออกบิลวันที่ {thDate(today)}</span>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const amount = Number(r.monthly_rent) * r.months;
          const overdue = r.period_start < today;
          return (
            <li key={r.contract_id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <input
                type="checkbox"
                name="contract_id"
                value={r.contract_id}
                checked={selected.has(r.contract_id)}
                disabled={r.is_partial}
                onChange={() => toggle(r.contract_id)}
                className="mt-1 size-5 shrink-0 accent-ink"
                aria-label={`เลือก ${r.unit_code}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{r.unit_code}</span>
                  <span className="truncate text-sm text-muted">{r.tenant_name}</span>
                  {overdue && <Badge tone="bad">เลยวันเริ่มรอบแล้ว</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  รอบ {thDate(r.period_start)} – {thDate(r.period_end)} · {BILLING_CYCLE_LABEL[r.billing_cycle]} · {r.branch_name}
                </div>
                {r.is_partial && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-warn">
                    <AlertTriangle className="size-3.5" /> รอบไม่เต็ม (ใกล้สิ้นสุดสัญญา) กรุณาตรวจยอดและออกบิลทีละรายการ
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="tabular font-semibold">{money(amount)}</span>
                <Link href={`/invoices/new?contract=${r.contract_id}`} className="btn btn-outline btn-sm">
                  <FilePlus2 className="size-3.5" /> ออกบิล
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && (
        <div className="safe-bottom sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface px-4 py-3 shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.25)] sm:px-5 lg:bottom-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              เลือก <b>{selected.size}</b> รายการ · <b className="tabular">{money(total)}</b> บาท
            </div>
            <SubmitButton className="btn btn-primary" pendingText="กำลังออกบิล…">
              ออกบิลที่เลือก
            </SubmitButton>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
