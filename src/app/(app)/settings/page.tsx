import clsx from "clsx";
import { ArrowRight, Bell, Building2, FileText, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { getSettings, getWatermark } from "@/lib/data";
import type { DocWatermark, Settings } from "@/lib/types";
import { AlertsForm, BusinessForm, ContractSettingsForm, DocumentsForm } from "./settings-forms";
import { SettingsHero } from "./settings-ui";
import { WatermarkForm } from "./watermark-form";

export const metadata: Metadata = { title: "ตั้งค่า" };

type Status = { text: string; missing?: boolean };

const SECTIONS: {
  key: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  status: (s: Settings, wm: DocWatermark | null) => Status[];
}[] = [
  {
    key: "business",
    label: "ข้อมูลกิจการ",
    desc: "ชื่อ ที่อยู่ เลขผู้เสียภาษี แสดงบนหัวใบวางบิล ใบเสร็จ และสัญญา",
    icon: Building2,
    status: (s) => [
      { text: s.business_name || "ยังไม่ได้ตั้งชื่อกิจการ", missing: !s.business_name },
      s.tax_id ? { text: `เลขผู้เสียภาษี ${s.tax_id}` } : { text: "ยังไม่มีเลขผู้เสียภาษี", missing: true },
    ],
  },
  {
    key: "documents",
    label: "สัญญาเช่าและเอกสาร",
    desc: "เงื่อนไขสัญญา แม่แบบสัญญา เลขเอกสาร ช่องทางชำระเงิน และลายน้ำบนเอกสาร",
    icon: FileText,
    status: (s, wm) => [
      s.lessor_name ? { text: `ผู้ให้เช่า ${s.lessor_name}` } : { text: "ยังไม่ได้ใส่ชื่อผู้ให้เช่า", missing: true },
      s.payment_instructions ? { text: "มีช่องทางชำระเงินแล้ว" } : { text: "ยังไม่ได้ใส่ช่องทางชำระเงิน", missing: true },
      { text: wm?.image && wm.enabled ? "ลายน้ำ: เปิดอยู่" : "ลายน้ำ: ยังไม่ใช้" },
    ],
  },
  {
    key: "alerts",
    label: "การแจ้งเตือน",
    desc: "แจ้งออกใบวางบิลล่วงหน้า และสัญญาใกล้หมด",
    icon: Bell,
    status: (s) => [{ text: `ออกใบวางบิลล่วงหน้า ${s.due_soon_days} วัน` }, { text: `สัญญาใกล้หมด แจ้งก่อน ${s.expiring_soon_days} วัน` }],
  },
];

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireOwner();
  const sp = await searchParams;
  const section = SECTIONS.find((x) => x.key === sp.section);
  const needWm = !section || section.key === "documents";
  const [s, wm] = await Promise.all([getSettings(), needWm ? getWatermark() : Promise.resolve(null)]);

  // หน้าแรก: เมนูให้เลือกหัวข้อ พร้อมสถานะสั้นๆ ว่าตั้งค่าอะไรไว้แล้ว/ยังขาดอะไร
  if (!section) {
    return (
      <div className="mx-auto max-w-5xl">
        <SettingsHero icon={SettingsIcon} title="ตั้งค่า" />
        <div className="grid gap-4 md:grid-cols-3">
          {SECTIONS.map(({ key, label, desc, icon: Icon, status }) => {
            const items = status(s, wm);
            const missing = items.filter((i) => i.missing).length;
            return (
              <Link
                key={key}
                href={`/settings?section=${key}`}
                className="group card flex flex-col overflow-hidden border-2 border-transparent transition hover:-translate-y-0.5 hover:border-ink hover:shadow-lg active:translate-y-0"
              >
                <div className="flex items-center justify-between bg-brand px-4 py-4 sm:px-5">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ink text-brand">
                    <Icon className="size-6" />
                  </span>
                  {missing > 0 && (
                    <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-brand">
                      ยังขาด {missing} รายการ
                    </span>
                  )}
                </div>
                <div className="flex-1 px-4 pt-4 pb-3 sm:px-5">
                  <h2 className="text-lg font-bold">{label}</h2>
                  <p className="mt-1 text-sm text-muted">{desc}</p>
                  <ul className="mt-3 space-y-1.5">
                    {items.map((it) => (
                      <li key={it.text} className="flex items-start gap-2 text-sm">
                        <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", it.missing ? "bg-warn" : "bg-ok")} />
                        <span className={clsx("min-w-0 break-words", it.missing ? "text-warn" : "text-ink-2")}>{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-between border-t border-line px-4 py-3 font-semibold sm:px-5">
                  ตั้งค่า{label}
                  <span className="grid size-8 place-items-center rounded-full bg-ink text-brand transition group-hover:translate-x-1">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsHero
        icon={section.icon}
        title={section.label}
        description={section.desc}
        back={{ href: "/settings", label: "ตั้งค่า" }}
      />
      <div className="space-y-5">
        {section.key === "business" && <BusinessForm s={s} bare />}
        {section.key === "documents" && (
          <>
            <ContractSettingsForm s={s} />
            <DocumentsForm s={s} />
            <WatermarkForm wm={wm} />
          </>
        )}
        {section.key === "alerts" && <AlertsForm s={s} bare />}
      </div>
    </div>
  );
}
