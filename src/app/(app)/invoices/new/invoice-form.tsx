"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TaxPicker, TaxSummary } from "@/components/tax-picker";
import { Alert, Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { ITEM_TYPE_LABEL, money, thDate } from "@/lib/format";
import { computeTax, type TaxChoice } from "@/lib/tax";
import type { ItemType } from "@/lib/types";
import { createInvoice } from "../actions";

type Row = { key: number; item_type: ItemType; description: string; quantity: string; unit_price: string };

export function InvoiceForm({
  contractId,
  unitCode,
  monthlyRent,
  nextPeriod,
  contractStart,
  contractEnd,
  today,
  defaultTax,
  hasTaxId,
}: {
  contractId: string;
  unitCode: string;
  monthlyRent: number;
  nextPeriod: { start: string; end: string; months: number; partial: boolean } | null;
  contractStart: string;
  contractEnd: string;
  today: string;
  defaultTax: TaxChoice;
  hasTaxId: boolean;
}) {
  const [hasPeriod, setHasPeriod] = useState(Boolean(nextPeriod));
  const [periodStart, setPeriodStart] = useState(nextPeriod?.start ?? "");
  const [periodEnd, setPeriodEnd] = useState(nextPeriod?.end ?? "");
  const [issue, setIssue] = useState(today);
  const defaultDue = nextPeriod && nextPeriod.start > today ? nextPeriod.start : today;
  const [due, setDue] = useState(defaultDue);
  const [seq, setSeq] = useState(2);
  const [tax, setTax] = useState<TaxChoice>(defaultTax);
  const rentDesc = (s: string, e: string) => `ค่าเช่า ${unitCode}${s && e ? ` (${thDate(s)} – ${thDate(e)})` : ""}`;
  const [rows, setRows] = useState<Row[]>(
    nextPeriod
      ? [
          {
            key: 1,
            item_type: "rent",
            description: rentDesc(nextPeriod.start, nextPeriod.end),
            quantity: String(nextPeriod.months),
            unit_price: String(monthlyRent),
          },
        ]
      : [{ key: 1, item_type: "other", description: "", quantity: "1", unit_price: "" }],
  );

  // เปลี่ยนรอบบิลแล้วให้คำอธิบายค่าเช่าเปลี่ยนตาม (เฉพาะรายการที่ยังเป็นข้อความอัตโนมัติ)
  const syncRentDesc = (s: string, e: string) =>
    setRows((rs) =>
      rs.map((r) => (r.item_type === "rent" && r.description.startsWith(`ค่าเช่า ${unitCode}`) ? { ...r, description: rentDesc(s, e) } : r)),
    );
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (item_type: ItemType) => {
    const description =
      item_type === "late_fee" ? "ค่าปรับชำระล่าช้า" : item_type === "discount" ? "ส่วนลด" : item_type === "rent" ? rentDesc(periodStart, periodEnd) : "";
    setRows((rs) => [
      ...rs,
      { key: seq, item_type, description, quantity: "1", unit_price: item_type === "rent" ? String(monthlyRent) : "" },
    ]);
    setSeq((s) => s + 1);
  };

  const amountOf = (r: Row) => {
    const a = Math.round((Number(r.quantity) || 0) * (Number(r.unit_price) || 0) * 100) / 100;
    return r.item_type === "discount" ? -a : a;
  };
  const depositSum = rows.filter((r) => r.item_type === "deposit").reduce((a, r) => a + amountOf(r), 0);
  const sum = rows.reduce((a, r) => a + amountOf(r), 0) - depositSum;
  const t = computeTax(sum, tax, undefined, depositSum);
  const total = t.total;
  const hasRent = rows.some((r) => r.item_type === "rent");

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      item_type: r.item_type,
      description: r.description,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    })),
  );

  return (
    <ActionForm action={createInvoice} className="space-y-5">
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="items" value={itemsJson} />

      {nextPeriod?.partial && (
        <Alert tone="warn">
          รอบนี้ไม่เต็มรอบ (สัญญาสิ้นสุด {thDate(contractEnd)}) ระบบคิดเศษเดือนเป็น 1 เดือน กรุณาตรวจและแก้ยอดค่าเช่าให้ถูกต้อง
        </Alert>
      )}
      {!nextPeriod && (
        <Alert tone="info">ออกใบวางบิลค่าเช่าครบทุกรอบตามสัญญาแล้ว ใบนี้ใช้สำหรับค่าใช้จ่ายอื่น เช่น ค่าปรับหรือค่าเสียหาย</Alert>
      )}

      <Card>
        <CardHeader title="รอบบิลและวันที่" />
        <div className="space-y-4 p-4 sm:p-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="has_period"
              checked={hasPeriod}
              onChange={(e) => setHasPeriod(e.target.checked)}
              className="size-5 accent-ink"
            />
            <span className="text-sm font-medium">เป็นบิลค่าเช่าตามรอบ</span>
          </label>
          {hasPeriod && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="รอบบิลตั้งแต่" required>
                <input
                  name="period_start"
                  type="date"
                  required
                  min={contractStart}
                  max={contractEnd}
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    syncRentDesc(e.target.value, periodEnd);
                  }}
                  className="input"
                />
              </Field>
              <Field label="ถึง" required>
                <input
                  name="period_end"
                  type="date"
                  required
                  min={periodStart || contractStart}
                  max={contractEnd}
                  value={periodEnd}
                  onChange={(e) => {
                    setPeriodEnd(e.target.value);
                    syncRentDesc(periodStart, e.target.value);
                  }}
                  className="input"
                />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="วันที่ออกบิล" required>
              <input name="issue_date" type="date" required value={issue} onChange={(e) => setIssue(e.target.value)} className="input" />
            </Field>
            <Field label="ครบกำหนดชำระ" required>
              <input name="due_date" type="date" required min={issue} value={due} onChange={(e) => setDue(e.target.value)} className="input" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="รายการ" />
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.key} className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <select
                  value={r.item_type}
                  onChange={(e) => update(r.key, { item_type: e.target.value as ItemType })}
                  className="input w-auto"
                  aria-label="ประเภทรายการ"
                >
                  {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
                    <option key={t} value={t}>
                      {ITEM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <span className={`tabular ml-auto font-semibold ${r.item_type === "discount" ? "text-bad" : ""}`}>
                  {money(amountOf(r))}
                </span>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  disabled={rows.length === 1}
                  className="btn btn-ghost size-10 min-h-0 p-0 text-muted"
                  aria-label="ลบรายการ"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <input
                value={r.description}
                onChange={(e) => update(r.key, { description: e.target.value })}
                placeholder="รายละเอียด"
                required
                className="input"
                aria-label="รายละเอียด"
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label={r.item_type === "rent" ? "จำนวน (เดือน)" : "จำนวน"}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    required
                    value={r.quantity}
                    onChange={(e) => update(r.key, { quantity: e.target.value })}
                    className="input tabular"
                  />
                </Field>
                <Field label="ราคาต่อหน่วย (บาท)">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    required
                    value={r.unit_price}
                    onChange={(e) => update(r.key, { unit_price: e.target.value })}
                    className="input tabular"
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
          {!hasRent && hasPeriod && (
            <button type="button" onClick={() => addRow("rent")} className="btn btn-outline btn-sm">
              <Plus className="size-3.5" /> ค่าเช่า
            </button>
          )}
          <button type="button" onClick={() => addRow("late_fee")} className="btn btn-outline btn-sm">
            <Plus className="size-3.5" /> ค่าปรับ
          </button>
          <button type="button" onClick={() => addRow("other")} className="btn btn-outline btn-sm">
            <Plus className="size-3.5" /> ค่าใช้จ่ายอื่น
          </button>
          <button type="button" onClick={() => addRow("discount")} className="btn btn-outline btn-sm">
            <Plus className="size-3.5" /> ส่วนลด
          </button>
        </div>
        <TaxSummary t={t} choice={tax} className="rounded-b-card border-t border-line bg-canvas/60 px-4 py-4 sm:px-5" />
      </Card>

      <Card>
        <CardHeader title="ภาษี" description="เลือกให้ตรงกับลูกค้ารายนี้ ใบถัดไปของสัญญานี้จะใช้ค่าเดียวกันให้อัตโนมัติ" />
        <div className="space-y-3 p-4 sm:p-5">
          <TaxPicker value={tax} onChange={setTax} />
          {tax.vat && !hasTaxId && (
            <Alert tone="warn">ยังไม่ได้กรอกเลขประจำตัวผู้เสียภาษีของกิจการ กรุณากรอกที่ ตั้งค่า → ข้อมูลกิจการ ก่อนออกบิลแบบมี VAT</Alert>
          )}
        </div>
      </Card>

      <Field label="หมายเหตุในใบวางบิล">
        <textarea name="note" rows={2} className="input min-h-0" />
      </Field>

      <div className="flex justify-end">
        <SubmitButton className="btn btn-primary w-full sm:w-auto" pendingText="กำลังออกใบวางบิล…">
          ออกใบวางบิล {money(total)} บาท
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
