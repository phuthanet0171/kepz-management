import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import {
  buildContractFields,
  DEFAULT_TEMPLATE_PARKING,
  DEFAULT_TEMPLATE_STORAGE,
  resolveContractTerms,
  type ContractTemplateInput,
} from "@/lib/contract-template";
import { getSettings } from "@/lib/data";
import { addDays, addMonths, dateOfTH, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Branch, ContractView, Settings, Tenant, UnitKind } from "@/lib/types";
import { TemplateEditor, type PreviewSource } from "./template-editor";

export const metadata: Metadata = { title: "แม่แบบสัญญาเช่า" };

/** ข้อมูลตัวอย่างเมื่อยังไม่มีสัญญาจริงของประเภทนั้น */
function sampleInput(s: Settings, kind: UnitKind): ContractTemplateInput {
  const start = todayTH();
  return {
    contract_no: `${s.contract_prefix}0000-0000`,
    signed_on: start,
    start_date: start,
    end_date: addDays(addMonths(start, 6), -1),
    billing_cycle: "monthly",
    monthly_rent: kind === "parking" ? 1990 : 1600,
    deposit_amount: kind === "parking" ? 1990 : 1600,
    purpose: kind === "parking" ? "กข 1234 กรุงเทพมหานคร" : "เฟอร์นิเจอร์และของใช้ในบ้าน",
    note: null,
    business_name: s.business_name,
    branch_name: "สาขาตัวอย่าง",
    branch_address: "ที่อยู่สาขาตัวอย่าง",
    unit_code: kind === "parking" ? "P-01" : "S-01",
    unit_type_name: kind === "parking" ? "ที่จอดรถ" : "ห้อง S",
    size_label: null,
    tenant: { full_name: "ผู้เช่า ตัวอย่าง", phone: "081-234-5678", address: "ที่อยู่ผู้เช่าตัวอย่าง", id_number: null, line_id: null },
    terms: resolveContractTerms(s),
  };
}

async function latestContractInput(s: Settings, kind: UnitKind): Promise<PreviewSource | null> {
  const supabase = await createClient();
  const { data: types } = await supabase.from("unit_types").select("code, size_label").eq("kind", kind);
  const codes = (types ?? []).map((t) => t.code);
  if (codes.length === 0) return null;
  const { data } = await supabase
    .from("v_contracts")
    .select("*")
    .in("unit_type_code", codes)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const c = data as ContractView;
  const [{ data: tenant }, { data: branch }, { data: extra }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", c.tenant_id).single(),
    supabase.from("branches").select("*").eq("id", c.branch_id).single(),
    supabase.from("contracts").select("purpose").eq("id", c.id).single(),
  ]);
  if (!tenant) return null;
  const b = branch as Branch | null;
  return {
    label: `สัญญาล่าสุด ${c.contract_no} · ${c.unit_code} · ${c.tenant_name}`,
    fields: buildContractFields({
      contract_no: c.contract_no,
      signed_on: dateOfTH(c.created_at),
      start_date: c.start_date,
      end_date: c.end_date,
      billing_cycle: c.billing_cycle,
      monthly_rent: Number(c.monthly_rent),
      deposit_amount: Number(c.deposit_amount),
      purpose: extra?.purpose ?? null,
      note: c.note,
      business_name: s.business_name,
      branch_name: c.branch_name,
      branch_address: b?.address ?? null,
      unit_code: c.unit_code,
      unit_type_name: c.unit_type_name,
      size_label: types?.find((t) => t.code === c.unit_type_code)?.size_label ?? null,
      tenant: tenant as Tenant,
      terms: resolveContractTerms(s, b),
    }),
    lessorName: resolveContractTerms(s, b).lessor_name,
    tenantName: c.tenant_name,
  };
}

export default async function ContractTemplatePage() {
  await requireOwner();
  const s = await getSettings();
  const [storage, parking] = await Promise.all([latestContractInput(s, "storage"), latestContractInput(s, "parking")]);
  const sample = (kind: UnitKind): PreviewSource => {
    const input = sampleInput(s, kind);
    return {
      label: "ข้อมูลตัวอย่าง (ยังไม่มีสัญญาจริงของประเภทนี้)",
      fields: buildContractFields(input),
      lessorName: input.terms.lessor_name,
      tenantName: input.tenant.full_name,
    };
  };

  return (
    <>
      <PageHeader
        title="แม่แบบสัญญาเช่า"
        subtitle="แก้ถ้อยคำได้เอง ช่องในวงเล็บปีกกา เช่น {ชื่อผู้เช่า} ระบบจะเติมข้อมูลจริงให้ตอนพิมพ์"
        back={{ href: "/settings", label: "ตั้งค่า" }}
      />
      <TemplateEditor
        initial={{ storage: s.contract_template_storage, parking: s.contract_template_parking }}
        defaults={{ storage: DEFAULT_TEMPLATE_STORAGE, parking: DEFAULT_TEMPLATE_PARKING }}
        previews={{ storage: storage ?? sample("storage"), parking: parking ?? sample("parking") }}
        business={{
          name: s.business_name,
          address: s.business_address,
          phone: s.business_phone,
          email: s.business_email,
          tax_id: s.tax_id,
        }}
      />
    </>
  );
}
