import { Bell, Building, ChevronRight, FileText, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { getSettings, getWatermark } from "@/lib/data";
import { AlertsForm, BusinessForm, ContractSettingsForm, DocumentsForm } from "./settings-forms";
import { WatermarkForm } from "./watermark-form";

export const metadata: Metadata = { title: "ตั้งค่า" };

const SECTIONS: { key: string; label: string; desc: string; icon: LucideIcon }[] = [
  { key: "business", label: "ข้อมูลกิจการ", desc: "ชื่อ ที่อยู่ เลขผู้เสียภาษี แสดงบนหัวใบวางบิล ใบเสร็จ และสัญญา", icon: Building },
  {
    key: "documents",
    label: "สัญญาเช่าและเอกสาร",
    desc: "เงื่อนไขสัญญา แม่แบบสัญญา เลขเอกสาร ช่องทางชำระเงิน และลายน้ำบนเอกสาร",
    icon: FileText,
  },
  { key: "alerts", label: "การแจ้งเตือน", desc: "แจ้งออกใบวางบิลล่วงหน้า และสัญญาใกล้หมด", icon: Bell },
];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireOwner();
  const sp = await searchParams;
  const section = SECTIONS.find((x) => x.key === sp.section);

  // หน้าแรก: เมนูให้เลือกหัวข้อ
  if (!section) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="ตั้งค่า" />
        <Card>
          <ul className="divide-y divide-line">
            {SECTIONS.map(({ key, label, desc, icon: Icon }, i) => (
              <li key={key}>
                <Link
                  href={`/settings?section=${key}`}
                  className="flex items-center gap-4 px-4 py-4 transition hover:bg-canvas/50 active:bg-canvas sm:px-5"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft">
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {i + 1}. {label}
                    </span>
                    <span className="block text-sm text-muted">{desc}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const [s, wm] = await Promise.all([getSettings(), section.key === "documents" ? getWatermark() : Promise.resolve(null)]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/settings", label: "ตั้งค่า" }} title={section.label} />
      <div className="space-y-4">
        {section.key === "business" && <BusinessForm s={s} />}
        {section.key === "documents" && (
          <>
            <ContractSettingsForm s={s} />
            <DocumentsForm s={s} />
            <WatermarkForm wm={wm} />
          </>
        )}
        {section.key === "alerts" && <AlertsForm s={s} />}
      </div>
    </div>
  );
}
