"use client";

import { ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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

/** มือถือ: ปุ่ม ⋯ รวมงานที่ใช้ไม่บ่อย (เพิ่มชั้น/โซน · ลบผัง) ไม่ให้แย่งพื้นที่ผัง */
export function PlanMenuButton({
  branchId,
  planId,
  planName,
  nextIndex,
}: {
  branchId: string;
  planId: string;
  planName: string;
  nextIndex: number;
}) {
  return (
    <Sheet
      title="ชั้น / โซน"
      triggerClassName="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 active:bg-canvas"
      trigger={
        <>
          <MoreHorizontal className="size-5" />
          <span className="sr-only">ตัวเลือกผัง</span>
        </>
      }
    >
      {() => <PlanMenuBody branchId={branchId} planId={planId} planName={planName} nextIndex={nextIndex} />}
    </Sheet>
  );
}

function PlanMenuBody({ branchId, planId, planName, nextIndex }: { branchId: string; planId: string; planName: string; nextIndex: number }) {
  const [view, setView] = useState<"menu" | "add" | "delete">("menu");
  if (view === "add") {
    return (
      <ActionForm action={createFloorPlan}>
        <NewPlanFields branchId={branchId} defaultName={`ชั้น ${nextIndex}`} />
        <SubmitButton className="btn btn-primary w-full">สร้างชั้น / โซนใหม่</SubmitButton>
      </ActionForm>
    );
  }
  if (view === "delete") {
    return (
      <ActionForm action={deleteFloorPlan}>
        <input type="hidden" name="id" value={planId} />
        <input type="hidden" name="branch_id" value={branchId} />
        <p className="text-sm text-ink-2">
          ลบผัง <b>“{planName}”</b> เฉพาะผังและตำแหน่งกล่อง ห้อง ผู้เช่า และสัญญาไม่ได้รับผลกระทบ ห้องในผังนี้จะกลับไปอยู่ในรายการ “ยังไม่ได้วาง”
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-outline" onClick={() => setView("menu")}>
            ไม่ลบ
          </button>
          <SubmitButton className="btn bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ยืนยันลบผัง
          </SubmitButton>
        </div>
      </ActionForm>
    );
  }
  const row = "flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3.5 text-left font-medium active:bg-canvas";
  return (
    <div className="grid gap-2">
      <button type="button" className={row} onClick={() => setView("add")}>
        <Plus className="size-5" />
        <span className="flex-1">เพิ่มชั้น / โซน</span>
        <ChevronRight className="size-4 text-muted" />
      </button>
      <button type="button" className={`${row} text-bad`} onClick={() => setView("delete")}>
        <Trash2 className="size-5" />
        <span className="flex-1">ลบผัง “{planName}”</span>
        <ChevronRight className="size-4 text-muted" />
      </button>
    </div>
  );
}
