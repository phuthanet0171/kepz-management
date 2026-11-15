import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getUnitTypes } from "@/lib/data";
import { NewBranchForm } from "./branch-form";

export const metadata: Metadata = { title: "เพิ่มสาขา" };

export default async function NewBranchPage() {
  const unitTypes = await getUnitTypes();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="เพิ่มสาขา" back={{ href: "/branches", label: "สาขา" }} />
      <NewBranchForm unitTypes={unitTypes} />
    </div>
  );
}
