"use client";

import { Pencil, Plus } from "lucide-react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import type { Branch, UnitType } from "@/lib/types";
import { addUnits, updateBranch } from "../actions";

export function EditBranchButton({ branch }: { branch: Branch }) {
  return (
    <Sheet
      title="แก้ไขข้อมูลสาขา"
      trigger={
        <>
          <Pencil className="size-4" /> แก้ไข
        </>
      }
    >
      {(close) => (
        <ActionForm action={updateBranch} onSuccess={close}>
          <input type="hidden" name="id" value={branch.id} />
          <Field label="ชื่อสาขา" required>
            <input name="name" required defaultValue={branch.name} className="input" />
          </Field>
          <Field label="ที่อยู่">
            <textarea name="address" rows={2} defaultValue={branch.address ?? ""} className="input min-h-0" />
          </Field>
          <Field label="เบอร์โทรสาขา">
            <input name="phone" type="tel" defaultValue={branch.phone ?? ""} className="input" />
          </Field>
          <Field label="หมายเหตุ">
            <input name="note" defaultValue={branch.note ?? ""} className="input" />
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" name="is_active" defaultChecked={branch.is_active} className="size-5 accent-ink" />
            <span>
              <span className="block text-sm font-medium">เปิดใช้งานสาขา</span>
              <span className="block text-xs text-muted">ปิดเพื่อซ่อนสาขาจากการทำสัญญาใหม่ ข้อมูลเดิมยังอยู่ครบ</span>
            </span>
          </label>
          <SubmitButton className="btn btn-primary w-full">บันทึก</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function AddUnitsButton({ branchId, unitTypes }: { branchId: string; unitTypes: UnitType[] }) {
  return (
    <Sheet
      title="เพิ่มห้อง / ที่จอด"
      description="รหัสจะรันต่อจากรหัสล่าสุดของประเภทนั้นในสาขานี้"
      triggerClassName="btn btn-primary"
      trigger={
        <>
          <Plus className="size-4" /> เพิ่มห้อง
        </>
      }
    >
      {(close) => (
        <ActionForm action={addUnits} onSuccess={close}>
          <input type="hidden" name="branch_id" value={branchId} />
          <Field label="ประเภท" required>
            <select name="unit_type_code" required className="input" defaultValue="">
              <option value="" disabled>
                เลือกประเภท
              </option>
              {unitTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name} (รหัส {t.code_prefix}-xx)
                </option>
              ))}
            </select>
          </Field>
          <Field label="จำนวน" required>
            <input name="count" type="number" inputMode="numeric" min={1} max={500} required className="input" />
          </Field>
          <SubmitButton className="btn btn-primary w-full">เพิ่ม</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
