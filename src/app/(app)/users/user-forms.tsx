"use client";

import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { createUser, deleteUser, updateUser } from "./actions";

export type UserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  /** null = บัญชีที่มีใน Supabase แต่ยังไม่ได้รับสิทธิ์เข้าใช้ระบบ */
  role: "owner" | "staff" | null;
  is_active: boolean;
};

function RolePicker({ defaultRole, disabled }: { defaultRole: "owner" | "staff"; disabled?: boolean }) {
  return (
    <Field label="สิทธิ์">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ["staff", "Staff", "ผู้เช่า สัญญา ออกบิล รับชำระ สถานะห้อง ทุกสาขา (ไม่เห็นรายได้รวม รายงาน ตั้งค่า)"],
            ["owner", "Owner", "ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้ สาขา ผังสถานที่ รายงาน และตั้งค่า"],
          ] as const
        ).map(([v, label, desc]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name="role" value={v} defaultChecked={defaultRole === v} disabled={disabled} className="peer sr-only" />
            <span className="block h-full rounded-xl border-2 border-line p-3 transition peer-checked:border-ink peer-checked:bg-brand-soft peer-disabled:opacity-60">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{desc}</span>
            </span>
          </label>
        ))}
      </div>
      {disabled && <input type="hidden" name="role" value={defaultRole} />}
    </Field>
  );
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function PasswordInput({ name, required, placeholder }: { name: string; required?: boolean; placeholder?: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        name={name}
        type="text"
        autoComplete="new-password"
        // ช่องนี้แสดงเป็นตัวอักษร: ปิดการพิมพ์ใหญ่/แก้คำอัตโนมัติของมือถือ ไม่ให้รหัสผ่านถูกเปลี่ยนโดยไม่รู้ตัว
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={8}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input font-mono"
      />
      <button type="button" className="btn btn-outline shrink-0" onClick={() => setValue(generatePassword())}>
        สุ่ม
      </button>
    </div>
  );
}

export function AddUserButton() {
  return (
    <Sheet
      title="เพิ่มผู้ใช้"
      description="บัญชีใช้งานได้ทันที แจ้งอีเมลและรหัสผ่านให้ผู้ใช้ แล้วให้เปลี่ยนรหัสเองที่ “บัญชีของฉัน”"
      triggerClassName="btn btn-primary"
      trigger={
        <>
          <UserPlus className="size-4" /> เพิ่มผู้ใช้
        </>
      }
    >
      {() => (
        <ActionForm action={createUser}>
          <Field label="ชื่อ" required>
            <input name="display_name" required maxLength={60} className="input" />
          </Field>
          <Field label="อีเมล (ใช้เข้าสู่ระบบ)" required>
            <input name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="input" />
          </Field>
          <Field label="รหัสผ่านเริ่มต้น" required hint="อย่างน้อย 8 ตัวอักษร กด “สุ่ม” เพื่อสร้างรหัสที่ปลอดภัย">
            <PasswordInput name="password" required />
          </Field>
          <RolePicker defaultRole="staff" />
          <SubmitButton className="btn btn-primary w-full" pendingText="กำลังสร้างบัญชี…">
            สร้างบัญชี
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function EditUserButton({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  return (
    <Sheet
      title={`แก้ไข ${user.display_name || user.email}`}
      description={user.email ?? undefined}
      triggerClassName="btn btn-outline btn-sm"
      trigger={
        <>
          <Pencil className="size-3.5" /> แก้ไข
        </>
      }
    >
      {(close) => (
        <ActionForm action={updateUser} onSuccess={close}>
          <input type="hidden" name="user_id" value={user.user_id} />
          <Field label="ชื่อ" required>
            <input name="display_name" required maxLength={60} defaultValue={user.display_name ?? ""} className="input" />
          </Field>
          <RolePicker defaultRole={user.role ?? "staff"} disabled={isSelf} />
          <label className="flex items-center gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" name="is_active" defaultChecked={user.role === null || user.is_active} disabled={isSelf} className="size-5 accent-ink" />
            <span>
              <span className="block text-sm font-medium">เปิดใช้งานบัญชี</span>
              <span className="block text-xs text-muted">ปิดเพื่อระงับการเข้าสู่ระบบทันที ประวัติการทำงานยังอยู่ครบ</span>
            </span>
          </label>
          {isSelf && <input type="hidden" name="is_active" value="on" />}
          <Field label="ตั้งรหัสผ่านใหม่ให้ผู้ใช้" hint="เว้นว่างถ้าไม่ต้องการเปลี่ยน">
            <PasswordInput name="new_password" placeholder="ไม่เปลี่ยน" />
          </Field>
          {isSelf && <p className="text-xs text-muted">บัญชีของคุณเอง: เปลี่ยนสิทธิ์หรือปิดบัญชีไม่ได้</p>}
          <SubmitButton className="btn btn-primary w-full">บันทึก</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DeleteUserButton({ user }: { user: UserRow }) {
  return (
    <Sheet
      title="ลบผู้ใช้"
      description={user.email ?? undefined}
      triggerClassName="btn btn-ghost btn-sm size-9 p-0 text-bad"
      trigger={<Trash2 className="size-4" aria-label="ลบผู้ใช้" />}
    >
      {() => (
        <ActionForm action={deleteUser}>
          <input type="hidden" name="user_id" value={user.user_id} />
          <p className="text-sm text-ink-2">
            บัญชีนี้จะถูกลบถาวรและเข้าสู่ระบบไม่ได้อีก <b>กู้คืนไม่ได้</b> ข้อมูลที่ผู้ใช้เคยบันทึก (สัญญา บิล ใบเสร็จ) ยังอยู่ครบ
          </p>
          <p className="text-xs text-muted">ถ้าแค่ต้องการระงับชั่วคราว ให้ใช้ “แก้ไข” แล้วปิดการใช้งานแทน</p>
          <Field label={<>พิมพ์อีเมล “{user.email}” เพื่อยืนยัน</>} required>
            <input name="confirm_email" type="email" required autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="input" />
          </Field>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ลบผู้ใช้ถาวร
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
