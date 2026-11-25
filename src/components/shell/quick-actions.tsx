"use client";

import { FilePlus2, FileSignature, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/ui/client";

const ACTIONS = [
  { href: "/contracts/new", label: "ทำสัญญาเช่า", desc: "เลือกห้องว่าง ผู้เช่า และระยะสัญญา", icon: FileSignature },
  { href: "/invoices?tab=due", label: "ออกใบวางบิล", desc: "สัญญาที่ถึงรอบออกใบวางบิล", icon: FilePlus2 },
  { href: "/tenants/new", label: "เพิ่มผู้เช่า", desc: "บันทึกข้อมูลผู้เช่ารายใหม่", icon: UserPlus },
];

/** หน้าที่ไม่ต้องแสดงปุ่ม + (กำลังกรอกฟอร์มหรือจัดผังอยู่) */
// /units = ผังห้อง ปุ่มลอยจะบังห้อง (ทำสัญญาได้จากแผงข้อมูลห้องอยู่แล้ว)
const HIDDEN = [/^\/contracts\/new/, /^\/tenants\/new/, /^\/invoices\/new/, /\/floor-plan/, /^\/menu/, /^\/units$/];

/** ปุ่ม + ลอยมุมขวาล่างบนมือถือ/แท็บเล็ต สำหรับงานที่ทำบ่อย */
export function QuickActions() {
  const pathname = usePathname();
  if (HIDDEN.some((r) => r.test(pathname))) return null;
  return (
    <div className="no-print fixed right-4 z-40 lg:hidden" style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}>
      <Sheet
        title="ทำรายการใหม่"
        triggerClassName="grid size-14 place-items-center rounded-full bg-brand text-ink shadow-lg ring-1 ring-ink/10 transition active:scale-95"
        trigger={
          <>
            <Plus className="size-7" strokeWidth={2.5} />
            <span className="sr-only">ทำรายการใหม่</span>
          </>
        }
      >
        {(close) => (
          <ul className="-mx-2 space-y-1">
            {ACTIONS.map(({ href, label, desc, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={close} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-canvas">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-sm text-muted">{desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
