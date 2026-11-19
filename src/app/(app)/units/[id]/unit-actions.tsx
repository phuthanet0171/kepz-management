"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { baht } from "@/lib/format";
import type { UnitType, UnitView } from "@/lib/types";
import { deleteUnit, updateUnit } from "../actions";

export function EditUnitButton({ unit, unitTypes }: { unit: UnitView; unitTypes: UnitType[] }) {
  const occupied = unit.status === "occupied";
  return (
    <Sheet
      title={`แก้ไขห้อง ${unit.code}`}
      trigger={
        <>
          <Pencil className="size-4" /> แก้ไขห้อง
        </>
      }
    >
      {(close) => (
        <ActionForm action={updateUnit} onSuccess={close}>
          <input type="hidden" name="id" value={unit.id} />
          <Field label="รหัสห้อง" required hint="ให้ตรงกับป้ายหน้าห้องจริง">
            <input name="code" required maxLength={20} defaultValue={unit.code} className="input uppercase" />
          </Field>
          <Field label="ประเภท" required>
            <select name="unit_type_code" defaultValue={unit.unit_type_code} className="input">
              {unitTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name} — {baht(t.default_monthly_price)}/เดือน
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="ราคาเฉพาะห้องนี้ (บาท/เดือน)"
            hint="เว้นว่างเพื่อใช้ราคาของสาขาตามประเภทห้อง ราคาที่เปลี่ยนจะใช้กับสัญญาใหม่เท่านั้น"
          >
            <input
              name="monthly_price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={unit.monthly_price ?? ""}
              className="input tabular"
            />
          </Field>
          <Field label="หมายเหตุ">
            <input name="note" defaultValue={unit.note ?? ""} className="input" />
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              name="is_maintenance"
              defaultChecked={unit.is_maintenance}
              disabled={occupied}
              className="size-5 accent-ink"
            />
            <span>
              <span className="block text-sm font-medium">ปิดปรับปรุง</span>
              <span className="block text-xs text-muted">ห้องจะไม่ถูกนับเป็นห้องว่างและทำสัญญาใหม่ไม่ได้</span>
            </span>
          </label>
          {occupied && <input type="hidden" name="is_maintenance" value={unit.is_maintenance ? "on" : ""} />}
          <label className="flex items-center gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={unit.is_active}
              disabled={occupied}
              className="size-5 accent-ink"
            />
            <span>
              <span className="block text-sm font-medium">เปิดใช้งาน</span>
              <span className="block text-xs text-muted">ปิดเมื่อเลิกใช้ห้องนี้ถาวร ประวัติเดิมยังอยู่</span>
            </span>
          </label>
          {occupied && <input type="hidden" name="is_active" value="on" />}
          <SubmitButton className="btn btn-primary w-full">บันทึก</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DeleteUnitButton({ unit }: { unit: UnitView }) {
  return (
    <Sheet
      title={`ลบห้อง ${unit.code}`}
      triggerClassName="btn btn-danger btn-sm"
      trigger={
        <>
          <Trash2 className="size-3.5" /> ลบห้องนี้
        </>
      }
    >
      {() => (
        <ActionForm action={deleteUnit}>
          <input type="hidden" name="id" value={unit.id} />
          <p className="text-sm text-ink-2">
            ลบได้เฉพาะห้องที่ไม่เคยมีสัญญาเช่า การลบ<b>กู้คืนไม่ได้</b>
          </p>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ยืนยันลบห้อง {unit.code}
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
