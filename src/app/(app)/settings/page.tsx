import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getSettings, getWatermark } from "@/lib/data";
import { requireOwner } from "@/lib/auth";
import { AlertsForm, BusinessForm, ContractSettingsForm, DocumentsForm } from "./settings-forms";
import { WatermarkForm } from "./watermark-form";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsPage() {
  await requireOwner();
  const [s, wm] = await Promise.all([getSettings(), getWatermark()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" />
      <div className="space-y-4">
        <BusinessForm s={s} />
        <ContractSettingsForm s={s} />
        <DocumentsForm s={s} />
        <WatermarkForm wm={wm} />
        <AlertsForm s={s} />
      </div>
    </div>
  );
}
