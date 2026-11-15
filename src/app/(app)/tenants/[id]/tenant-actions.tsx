"use client";

import { Pencil, Trash2 } from "lucide-react";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import type { Tenant } from "@/lib/types";
import { deleteTenant, updateTenant } from "../actions";
import { TenantFields } from "../tenant-fields";

export function EditTenantButton({ tenant }: { tenant: Tenant }) {
  return (
    <Sheet
      title="แก้ไขข้อมูลผู้เช่า"
      trigger={
        <>
          <Pencil className="size-4" /> แก้ไข
        </>
      }
    >
      {(close) => (
        <ActionForm action={updateTenant} onSuccess={close}>
          <input type="hidden" name="id" value={tenant.id} />
          <TenantFields tenant={tenant} />
          <SubmitButton className="btn btn-primary w-full">บันทึก</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DeleteTenantButton({ tenant }: { tenant: Tenant }) {
  return (
    <Sheet
      title="ลบผู้เช่า"
      triggerClassName="btn btn-danger btn-sm"
      trigger={
        <>
          <Trash2 className="size-3.5" /> ลบผู้เช่า
        </>
      }
    >
      {() => (
        <ActionForm action={deleteTenant}>
          <input type="hidden" name="id" value={tenant.id} />
          <p className="text-sm text-ink-2">
            ลบ “{tenant.full_name}” ออกจากระบบ ลบได้เฉพาะผู้เช่าที่ไม่เคยมีสัญญา การลบ<b>กู้คืนไม่ได้</b>
          </p>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ยืนยันการลบ
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
