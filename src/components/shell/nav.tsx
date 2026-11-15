"use client";

import clsx from "clsx";
import {
  BarChart3,
  Building2,
  FileSignature,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: LucideIcon; ownerOnly?: boolean };
type Role = "owner" | "staff";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/units", label: "ห้องและที่จอด", icon: Warehouse },
  { href: "/tenants", label: "ผู้เช่า", icon: Users },
  { href: "/contracts", label: "สัญญาเช่า", icon: FileSignature },
  { href: "/invoices", label: "ใบแจ้งหนี้", icon: ReceiptText },
  { href: "/payments", label: "รับชำระ", icon: Wallet, ownerOnly: true },
  { href: "/reports", label: "รายงาน", icon: BarChart3, ownerOnly: true },
  { href: "/branches", label: "สาขา", icon: Building2, ownerOnly: true },
  { href: "/users", label: "ผู้ใช้งาน", icon: UserCog, ownerOnly: true },
  { href: "/settings", label: "ตั้งค่า", icon: Settings, ownerOnly: true },
];

const MOBILE_ITEMS: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/units", label: "ห้อง", icon: Warehouse },
  { href: "/tenants", label: "ผู้เช่า", icon: Users },
  { href: "/invoices", label: "บิล", icon: ReceiptText },
  { href: "/menu", label: "เมนู", icon: Menu },
];

const MENU_SECTIONS = ["/contracts", "/payments", "/reports", "/branches", "/users", "/settings", "/account", "/menu"];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/menu") return MENU_SECTIONS.some((p) => pathname.startsWith(p));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ role }: { role: Role }) {
  return <SidebarNavView pathname={usePathname()} role={role} />;
}

/** แสดงเมนูโดยไม่ต้องรู้ path (ใช้เป็น fallback ระหว่างรอ Suspense) */
export function SidebarNavView({ pathname, role }: { pathname: string; role: Role }) {
  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.filter((i) => role === "owner" || !i.ownerOnly).map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-brand text-ink" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

export function BottomNavView({ pathname }: { pathname: string }) {
  return (
    <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {MOBILE_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition",
                active ? "text-ink" : "text-muted",
              )}
            >
              <span
                className={clsx(
                  "grid h-7 w-12 place-items-center rounded-full transition",
                  active && "bg-brand",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
