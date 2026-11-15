import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/shell/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return <LoginForm next={next} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <Logo dark className="text-4xl" />
        <div>
          <p className="text-4xl leading-tight font-bold">
            รู้สถานะธุรกิจทั้งหมด
            <br />
            <span className="text-brand">ได้ในหน้าเดียว</span>
          </p>
          <p className="mt-4 max-w-sm text-white/60">ห้องเก็บของ ที่จอดรถ ผู้เช่า สัญญา และการเงิน ทุกสาขา</p>
        </div>
        <p className="text-sm text-white/40">Kepz Management System</p>
        <div className="absolute -right-24 -bottom-24 size-80 rounded-full bg-brand/15" />
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="text-4xl" />
            <p className="text-sm text-muted">Storage Management</p>
          </div>
          <h1 className="text-2xl font-bold">เข้าสู่ระบบ</h1>
          <p className="mt-1 mb-6 text-sm text-muted">สำหรับเจ้าของกิจการ</p>
          <Suspense>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
