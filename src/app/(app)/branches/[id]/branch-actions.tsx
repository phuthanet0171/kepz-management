"use client";

import { Pencil } from "lucide-react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import type { Branch, UnitType } from "@/lib/types";
import { updateBranch } from "../actions";
import { ContractTermsFields } from "../../settings/settings-forms";
import { BranchPriceFields } from "../branch-price-fields";

function hasOverrides(b: Branch) {
  return [b.lessor_name, b.bank_account, b.rent_due_day, b.late_fee_per_day, b.reclaim_day, b.overstay_fee_per_day].some(
    (v) => v !== null && v !== undefined && v !== "",
  );
}

export function EditBranchButton({ branch, unitTypes }: { branch: Branch; unitTypes: UnitType[] }) {
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
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="border-b border-line bg-canvas/60 px-4 py-2.5">
              <div className="text-sm font-semibold">ราคาและขนาดห้องของสาขานี้</div>
              <div className="text-xs text-muted">ราคาใหม่ใช้กับสัญญาที่ทำหลังจากนี้ ห้องที่ตั้งราคาเฉพาะไว้ยังใช้ราคาของห้องนั้น</div>
            </div>
            <BranchPriceFields unitTypes={unitTypes} />
          </div>
          <details className="group rounded-xl border border-line p-3" open={hasOverrides(branch)}>
            <summary className="cursor-pointer text-sm font-medium">ข้อมูลในสัญญาเฉพาะสาขานี้</summary>
            <p className="mt-1 mb-3 text-xs text-muted">เว้นว่างช่องไหน = ใช้ค่ากลางจาก ตั้งค่า → สัญญาเช่า</p>
            <ContractTermsFields
              values={branch}
              placeholders={{
                lessor_name: "ใช้ค่ากลาง",
                bank_account: "ใช้ค่ากลาง",
                rent_due_day: "ค่ากลาง",
                late_fee_per_day: "ค่ากลาง",
                reclaim_day: "ค่ากลาง",
                overstay_fee_per_day: "ค่ากลาง",
              }}
            />
          </details>
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
