import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** หัวหน้าตั้งค่าแบบแถบดำ-เหลืองของแบรนด์ */
export function SettingsHero({
  icon: Icon,
  title,
  description,
  back,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-3xl bg-ink px-5 py-5 text-white sm:px-7 sm:py-6">
      {/* ลายกราฟิกแบรนด์ */}
      <span aria-hidden className="absolute -top-10 -right-10 size-40 rounded-full bg-brand" />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1.5 bg-[repeating-linear-gradient(135deg,var(--color-brand)_0_12px,transparent_12px_24px)]"
      />
      <div className="relative">
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-0.5 text-sm text-white/60 transition hover:text-brand"
          >
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <div className="flex items-center gap-4 pr-24">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-ink sm:size-14">
            <Icon className="size-6 sm:size-7" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-white/70">{description}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}

/** กล่องฟอร์มตั้งค่า: หัวมีไอคอนเหลือง-ดำ ชัดว่ากำลังตั้งค่าอะไร */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  bare,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** ไม่แสดงหัวกล่อง (เมื่อหัวหน้าบอกหัวข้อไว้แล้ว ไม่ให้ซ้ำ) */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={bare ? "card overflow-hidden border-t-4 border-t-brand" : "card overflow-hidden"}>
      {!bare && (
        <div className="flex items-start gap-3 border-b-2 border-brand bg-brand-soft/60 px-4 py-3.5 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-brand">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
          </div>
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** แถบปุ่มบันทึกท้ายกล่อง (อยู่ในฟอร์ม) */
export function SaveBar({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/70 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
      {children}
    </div>
  );
}

export const SAVE_CLASS = "btn btn-brand w-full sm:w-auto sm:min-w-40";
