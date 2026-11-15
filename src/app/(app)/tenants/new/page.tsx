import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { NewTenantForm } from "./new-tenant-form";

export const metadata: Metadata = { title: "เพิ่มผู้เช่า" };

export default async function NewTenantPage({ searchParams }: PageProps<"/tenants/new">) {
  const sp = await searchParams;
  const returnTo = typeof sp.return === "string" && sp.return.startsWith("/contracts/new") ? sp.return : null;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="เพิ่มผู้เช่า"
        back={returnTo ? { href: returnTo, label: "กลับไปทำสัญญา" } : { href: "/tenants", label: "ผู้เช่า" }}
      />
      <NewTenantForm returnTo={returnTo} />
    </div>
  );
}
