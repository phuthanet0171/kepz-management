"use client";

import { Pencil } from "lucide-react";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import type { Tenant } from "@/lib/types";
import { updateTenant } from "../actions";
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
