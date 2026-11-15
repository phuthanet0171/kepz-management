"use client";

import { Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createTenant } from "../actions";
import { TenantFields } from "../tenant-fields";

export function NewTenantForm({ returnTo }: { returnTo: string | null }) {
  return (
    <ActionForm action={createTenant}>
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <Card className="p-4 sm:p-5">
        <TenantFields />
      </Card>
      <div className="flex justify-end">
        <SubmitButton className="btn btn-primary w-full sm:w-auto">
          {returnTo ? "บันทึกและกลับไปทำสัญญา" : "บันทึกผู้เช่า"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
