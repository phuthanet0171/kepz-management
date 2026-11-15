import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { requireOwner, ROLE_LABEL } from "@/lib/auth";
import { thDateTime } from "@/lib/format";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AddUserButton, EditUserButton, type UserRow } from "./user-forms";

export const metadata: Metadata = { title: "ผู้ใช้งาน" };

export default async function UsersPage() {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("app_users").select("user_id, email, display_name, role, is_active, created_at").order("created_at");
  const users = (data ?? []) as (UserRow & { created_at: string })[];

  const lastSignIn = new Map<string, string | null>();
  if (isAdminConfigured) {
    const { data: list } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="ผู้ใช้งาน"
        subtitle={`${users.filter((u) => u.is_active).length} บัญชีที่ใช้งานอยู่ · มีแต่ Owner ที่สร้างบัญชีได้`}
        actions={isAdminConfigured && <AddUserButton />}
      />

      {!isAdminConfigured && (
        <Alert tone="warn" className="mb-4">
          <div className="flex gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0" />
            <div>
              <b>ยังเพิ่มผู้ใช้ไม่ได้</b> ต้องตั้งค่า <code>SUPABASE_SECRET_KEY</code> ฝั่งเซิร์ฟเวอร์ก่อน
              (Supabase → Project Settings → API Keys → Secret keys) แล้วใส่ใน Vercel → Settings → Environment Variables
              แบบ <b>Secret</b> และ<b>ห้าม</b>ขึ้นต้นด้วย NEXT_PUBLIC_ จากนั้น Redeploy
            </div>
          </div>
        </Alert>
      )}

      <Card>
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const self = u.user_id === me.id;
            const last = lastSignIn.get(u.user_id);
            return (
              <li key={u.user_id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold">
                  {(u.display_name || u.email || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`truncate font-medium ${u.is_active ? "" : "text-muted line-through"}`}>
                      {u.display_name || u.email}
                    </span>
                    <Badge tone={u.role === "owner" ? "dark" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                    {!u.is_active && <Badge tone="bad">ปิดใช้งาน</Badge>}
                    {self && <Badge tone="brand">คุณ</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {u.email}
                    {isAdminConfigured && <> · เข้าใช้ล่าสุด {last ? thDateTime(last) : "ยังไม่เคย"}</>}
                  </div>
                </div>
                {isAdminConfigured && <EditUserButton user={u} isSelf={self} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
