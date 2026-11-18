import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getSettings, getUnitTypes } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { AlertsForm, BusinessForm, ContractSettingsForm, DocumentsForm, UnitTypesForm, VatForm } from "./settings-forms";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsPage() {
  await requireOwner();
  const [s, types] = await Promise.all([getSettings(), getUnitTypes()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" />
      <div className="space-y-4">
        <BusinessForm s={s} />
        <UnitTypesForm types={types} />
        <VatForm s={s} />
        <ContractSettingsForm s={s} />
        <DocumentsForm s={s} />
        <AlertsForm s={s} />
      </div>
    </div>
  );
}
