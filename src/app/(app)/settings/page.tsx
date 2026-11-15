import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getSettings, getUnitTypes } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { AlertsForm, BusinessForm, DocumentsForm, PasswordForm, UnitTypesForm, VatForm } from "./settings-forms";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [s, types, { data: user }] = await Promise.all([getSettings(), getUnitTypes(), supabase.auth.getUser()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" />
      <div className="space-y-4">
        <BusinessForm s={s} />
        <UnitTypesForm types={types} />
        <VatForm s={s} />
        <DocumentsForm s={s} />
        <AlertsForm s={s} />
        <PasswordForm email={user.user?.email ?? ""} />
      </div>
    </div>
  );
}
