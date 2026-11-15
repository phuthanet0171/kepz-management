"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { createFloorPlan, deleteFloorPlan } from "./actions";

export function NewPlanFields({ branchId, defaultName }: { branchId: string; defaultName: string }) {
  return (
    <>
      <input type="hidden" name="branch_id" value={branchId} />
      <Field label="ชื่อชั้น / โซน" required hint="เช่น ชั้น 1, อาคาร B, ลานจอดรถ">
        <input name="name" required maxLength={50} defaultValue={defaultName} className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ความกว้าง (ช่อง)" hint="ปรับภายหลังได้">
          <input name="cols" type="number" min={10} max={300} defaultValue={48} className="input tabular" />
        </Field>
        <Field label="ความยาว (ช่อง)">
          <input name="rows" type="number" min={10} max={300} defaultValue={32} className="input tabular" />
        </Field>
      </div>
    </>
  );
}

export function FirstPlanForm({ branchId }: { branchId: string }) {
  return (
    <ActionForm action={createFloorPlan} className="mx-auto max-w-sm space-y-4 text-left">
      <NewPlanFields branchId={branchId} defaultName="ชั้น 1" />
      <SubmitButton className="btn btn-primary w-full">สร้างผัง</SubmitButton>
    </ActionForm>
  );
}

export function AddPlanButton({ branchId, nextIndex }: { branchId: string; nextIndex: number }) {
  return (
    <Sheet
      title="เพิ่มชั้น / โซน"
      triggerClassName="btn btn-outline btn-sm"
      trigger={
        <>
          <Plus className="size-3.5" /> เพิ่มชั้น/โซน
        </>
      }
    >
      {() => (
        <ActionForm action={createFloorPlan}>
          <NewPlanFields branchId={branchId} defaultName={`ชั้น ${nextIndex}`} />
          <SubmitButton className="btn btn-primary w-full">สร้าง</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DeletePlanButton({ planId, branchId, name }: { planId: string; branchId: string; name: string }) {
  return (
    <Sheet
      title={`ลบผัง “${name}”`}
      triggerClassName="btn btn-danger btn-sm"
      trigger={
        <>
          <Trash2 className="size-3.5" /> ลบผังนี้
        </>
      }
    >
      {() => (
        <ActionForm action={deleteFloorPlan}>
          <input type="hidden" name="id" value={planId} />
          <input type="hidden" name="branch_id" value={branchId} />
          <p className="text-sm text-ink-2">
            ลบเฉพาะผังและตำแหน่งกล่อง ห้อง ผู้เช่า และสัญญาไม่ได้รับผลกระทบ ห้องในผังนี้จะกลับไปอยู่ในรายการ “ยังไม่ได้วาง”
          </p>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ยืนยันลบผัง
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
