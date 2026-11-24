import { LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { Logo } from "@/components/shell/logo";
import { BottomNav, BottomNavView, SidebarNav, SidebarNavView } from "@/components/shell/nav";
import { QuickActions } from "@/components/shell/quick-actions";
import { getCurrentUser, ROLE_LABEL } from "@/lib/auth";

/** ปุ่มบัญชีมุมขวาบนของมือถือ: วงกลมเหลืองอักษรแรกของชื่อ */
async function MobileAccount() {
  const user = await getCurrentUser();
  if (!user) return null;
  const name = user.display_name || user.email;
  return (
    <Link
      href="/account"
      className="flex items-center gap-2 rounded-full py-1 pr-1 pl-3 active:bg-white/10"
      aria-label="บัญชีของฉัน"
    >
      <span className="max-w-[9rem] truncate text-xs text-white/70">{name}</span>
      <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-ink">
        {name.trim().charAt(0).toUpperCase()}
      </span>
    </Link>
  );
}

/** บัญชีถูกปิดการใช้งาน/ถูกลบสิทธิ์ระหว่างที่ยังล็อกอินค้างอยู่ → ออกจากระบบทันที แทนที่จะเห็นหน้าว่าง */
async function MemberGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/signout");
  return null;
}

async function SidebarMenu() {
  const user = await getCurrentUser();
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav role={user?.role ?? "staff"} />
      </div>
      {user && (
        <Link href="/account" className="mt-3 block rounded-xl px-3 py-2 transition hover:bg-white/10">
          <div className="truncate text-sm font-medium text-white">{user.display_name || user.email}</div>
          <div className="text-xs text-white/50">{ROLE_LABEL[user.role]}</div>
        </Link>
      )}
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-3">
          <Logo dark className="text-3xl" />
          <span className="block text-xs text-white/50">Storage Management</span>
        </Link>
        <Suspense
          fallback={
            <div className="flex-1">
              <SidebarNavView pathname="" role="staff" />
            </div>
          }
        >
          <SidebarMenu />
        </Suspense>
        <form action={signOut} className="border-t border-white/10 pt-3">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white">
            <LogOut className="size-[18px]" />
            ออกจากระบบ
          </button>
        </form>
      </aside>

      <header
        className="no-print sticky top-0 z-30 border-b-[3px] border-brand bg-ink lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" aria-label="หน้าภาพรวม">
            <Logo dark className="text-2xl" />
          </Link>
          <Suspense fallback={null}>
            <MobileAccount />
          </Suspense>
        </div>
      </header>

      <main className="pb-nav mx-auto max-w-6xl overflow-x-clip px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
      <Suspense fallback={<BottomNavView pathname="" />}>
        <BottomNav />
      </Suspense>
      <Suspense fallback={null}>
        <QuickActions />
      </Suspense>
      <Suspense fallback={null}>
        <MemberGate />
      </Suspense>
    </div>
  );
}
