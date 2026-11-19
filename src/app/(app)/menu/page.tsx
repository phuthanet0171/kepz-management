import { BarChart3, Building2, ChevronRight, CircleUser, FileSignature, LogOut, Settings, UserCog, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { Card, PageHeader } from "@/components/ui";
import { getCurrentUser, ROLE_LABEL } from "@/lib/auth";

export const metadata: Metadata = { title: "เมนู" };

const ITEMS = [
  { href: "/contracts", label: "สัญญาเช่า", desc: "สัญญาที่ใช้งาน ใกล้หมด และสิ้นสุด", icon: FileSignature },
  { href: "/payments", label: "ใบเสร็จ", desc: "ใบเสร็จรับเงินทั้งหมด แยกตามเดือน", icon: Wallet, ownerOnly: true },
  { href: "/reports", label: "รายงาน", desc: "รายได้ ยอดค้าง อัตราการเช่า ส่งออก CSV", icon: BarChart3, ownerOnly: true },
  { href: "/branches", label: "สาขา", desc: "เพิ่มสาขา จัดการห้องและผังสถานที่", icon: Building2, ownerOnly: true },
  { href: "/users", label: "ผู้ใช้งาน", desc: "เพิ่มบัญชี กำหนดสิทธิ์ ปิดการใช้งาน", icon: UserCog, ownerOnly: true },
  { href: "/settings", label: "ตั้งค่า", desc: "ข้อมูลกิจการ สัญญา เอกสาร ลายน้ำ", icon: Settings, ownerOnly: true },
  { href: "/account", label: "บัญชีของฉัน", desc: "ชื่อที่แสดงและเปลี่ยนรหัสผ่าน", icon: CircleUser },
];

export default async function MenuPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/menu");
  const owner = user.role === "owner";
  return (
    <>
      <PageHeader
        title="เมนู"
        subtitle={user ? `${user.display_name || user.email} · ${ROLE_LABEL[user.role]}` : undefined}
      />
      <Card>
        <ul className="divide-y divide-line">
          {ITEMS.filter((i) => owner || !i.ownerOnly).map(({ href, label, desc, icon: Icon }) => (
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
