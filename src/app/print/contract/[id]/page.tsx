import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contract-document";
import { buildContractFields, parseTemplate, resolveContractTerms, templateFor } from "@/lib/contract-template";
import { getSettings } from "@/lib/data";
import { dateOfTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Branch, ContractView, Tenant, UnitKind } from "@/lib/types";
import { Paper } from "../../doc";

export const metadata: Metadata = { title: "สัญญาเช่า" };

export default async function PrintContractPage({ params }: PageProps<"/print/contract/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: cData }, { data: extra }, settings] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", id).maybeSingle(),
    supabase.from("contracts").select("purpose, created_at").eq("id", id).maybeSingle(),
    getSettings(),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;

  const [{ data: tenantData }, { data: unitType }, { data: branchData }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", c.tenant_id).single(),
    supabase.from("unit_types").select("kind, size_label").eq("code", c.unit_type_code).single(),
    supabase.from("branches").select("*").eq("id", c.branch_id).single(),
  ]);
  const t = tenantData as Tenant;
  const branch = branchData as Branch | null;
  const kind = (unitType?.kind ?? "storage") as UnitKind;
  const terms = resolveContractTerms(settings, branch);

  const fields = buildContractFields({
    contract_no: c.contract_no,
    signed_on: dateOfTH(extra?.created_at ?? c.created_at),
    start_date: c.start_date,
    end_date: c.end_date,
    billing_cycle: c.billing_cycle,
    monthly_rent: Number(c.monthly_rent),
    deposit_amount: Number(c.deposit_amount),
    purpose: extra?.purpose ?? null,
    note: c.note,
    business_name: settings.business_name,
    branch_name: c.branch_name,
    branch_address: branch?.address ?? null,
    unit_code: c.unit_code,
    unit_type_name: c.unit_type_name,
    size_label: unitType?.size_label ?? null,
    tenant: t,
    terms,
  });
  const blocks = parseTemplate(templateFor(settings, kind), fields);

  return (
    <Paper title={`สัญญาเช่า ${c.contract_no}`}>
      <ContractDocument
        blocks={blocks}
        fields={fields}
        kind={kind}
        business={{
          name: settings.business_name,
          address: settings.business_address,
          phone: settings.business_phone,
          email: settings.business_email,
          tax_id: settings.tax_id,
        }}
        lessorName={terms.lessor_name}
        tenantName={t.full_name}
      />
    </Paper>
  );
}
