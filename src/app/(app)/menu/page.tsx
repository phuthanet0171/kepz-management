import { BarChart3, Building2, ChevronRight, FileSignature, LogOut, Settings, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "เมนู" };

const ITEMS = [
  { href: "/contracts", label: "สัญญาเช่า", desc: "สัญญาที่ใช้งาน ใกล้หมด และสิ้นสุด", icon: FileSignature },
  { href: "/payments", label: "รับชำระ", desc: "ใบเสร็จรับเงินรายเดือน", icon: Wallet },
  { href: "/reports", label: "รายงาน", desc: "รายได้ ยอดค้าง อัตราการเช่า ส่งออก CSV", icon: BarChart3 },
  { href: "/branches", label: "สาขา", desc: "เพิ่มสาขา จัดการห้องและที่จอด", icon: Building2 },
  { href: "/settings", label: "ตั้งค่า", desc: "ข้อมูลกิจการ ราคา ภาษี เอกสาร", icon: Settings },
];

export default function MenuPage() {
  return (
    <>
      <PageHeader title="เมนู" />
      <Card>
        <ul className="divide-y divide-line">
          {ITEMS.map(({ href, label, desc, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-canvas">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted">{desc}</span>
                </span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <form action={signOut} className="mt-4">
        <button className="btn btn-outline w-full text-bad">
          <LogOut className="size-4" /> ออกจากระบบ
        </button>
      </form>
    </>
  );
}
