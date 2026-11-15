"use client";

import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { changePassword, updateDisplayName } from "./actions";

export function NameForm({ name }: { name: string }) {
  return (
    <Card>
      <CardHeader title="ชื่อที่แสดง" />
      <div className="p-4 sm:p-5">
        <ActionForm action={updateDisplayName} resetOnSuccess={false}>
          <Field label="ชื่อ">
            <input name="display_name" required maxLength={60} defaultValue={name} className="input" />
          </Field>
          <SubmitButton>บันทึก</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}

export function PasswordForm() {
  return (
    <Card>
      <CardHeader title="เปลี่ยนรหัสผ่าน" />
      <div className="p-4 sm:p-5">
        <ActionForm action={changePassword}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร">
              <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่">
              <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
            </Field>
          </div>
          <SubmitButton>เปลี่ยนรหัสผ่าน</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
