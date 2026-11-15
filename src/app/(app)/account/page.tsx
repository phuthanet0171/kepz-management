import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { getCurrentUser, ROLE_LABEL } from "@/lib/auth";
import { NameForm, PasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "บัญชีของฉัน" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="บัญชีของฉัน"
        subtitle={
          <span className="flex items-center gap-2">
            {user.email} <Badge tone={user.role === "owner" ? "dark" : "neutral"}>{ROLE_LABEL[user.role]}</Badge>
          </span>
        }
      />
      <div className="space-y-4">
        <NameForm name={user.display_name ?? ""} />
        <PasswordForm />
      </div>
    </div>
  );
}
