"use client";

import { ActionForm, SubmitButton } from "@/components/ui/client";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={signIn}>
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">อีเมล</span>
        <input name="email" type="email" autoComplete="email" required className="input" inputMode="email" />
      </label>
      <label className="block">
        <span className="label">รหัสผ่าน</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      <SubmitButton className="btn btn-primary w-full" pendingText="กำลังเข้าสู่ระบบ…">
        เข้าสู่ระบบ
      </SubmitButton>
    </ActionForm>
  );
}
