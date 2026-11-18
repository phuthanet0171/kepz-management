import { FileSignature, Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractStatusBadge, InvoiceStatusBadge } from "@/components/status";
import { Badge, Card, CardHeader, DefinitionList, PageHeader } from "@/components/ui";
import { isOwner } from "@/lib/auth";
import { baht, money, thDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContractView, InvoiceView, Tenant } from "@/lib/types";
import { PurgeButton, type PurgePreview } from "@/components/purge-button";
import { EditTenantButton } from "./tenant-actions";

export const metadata: Metadata = { title: "ข้อมูลผู้เช่า" };

export default async function TenantPage({ params }: PageProps<"/tenants/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: tenantData }, { data: contractData }, { data: invoiceData }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_contracts").select("*").eq("tenant_id", id).order("start_date", { ascending: false }),
    supabase
      .from("v_invoices")
      .select("*")
      .eq("tenant_id", id)
      .neq("status", "void")
      .order("issue_date", { ascending: false })
      .limit(20),
  ]);
  if (!tenantData) notFound();
  const owner = await isOwner();
  const { data: preview } = owner
    ? await supabase.rpc("purge_preview", { p_kind: "tenant", p_id: id }).single<PurgePreview>()
    : { data: null };
  const t = tenantData as Tenant;
  const contracts = (contractData ?? []) as ContractView[];
  const invoices = (invoiceData ?? []) as InvoiceView[];
  const outstanding = contracts.reduce((a, c) => a + Number(c.outstanding), 0);
  const company = t.tenant_type === "company";

  return (
    <>
      <PageHeader
        back={{ href: "/tenants", label: "ผู้เช่า" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {t.full_name} {company && <Badge>นิติบุคคล</Badge>}
          </span>
        }
        subtitle={
          outstanding > 0 ? (
            <span className="font-medium text-bad">ยอดค้างชำระรวม {money(outstanding)} บาท</span>
          ) : (
            "ไม่มียอดค้างชำระ"
          )
        }
        actions={
          <>
            <EditTenantButton tenant={t} />
            <Link href={`/contracts/new?tenant=${t.id}`} className="btn btn-primary">
              <FileSignature className="size-4" /> ทำสัญญาใหม่
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="ข้อมูลติดต่อ" />
            <div className="space-y-2 p-4 sm:p-5">
              <a href={`tel:${t.phone}`} className="btn btn-outline w-full justify-start">
                <Phone className="size-4" /> {t.phone}
              </a>
              {t.line_id && (
                <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm">
                  <MessageCircle className="size-4" /> LINE: {t.line_id}
                </div>
              )}
              {t.email && (
                <a href={`mailto:${t.email}`} className="btn btn-outline w-full justify-start">
                  <Mail className="size-4" /> <span className="truncate">{t.email}</span>
                </a>
              )}
              <div className="pt-3">
                <DefinitionList
                  items={[
                    { label: company ? "เลขผู้เสียภาษี" : "เลขบัตรประชาชน", value: t.id_number ?? "-" },
                    { label: company ? "ผู้ติดต่อ" : "ผู้ติดต่อฉุกเฉิน", value: t.emergency_contact_name ? `${t.emergency_contact_name}${t.emergency_contact_phone ? ` (${t.emergency_contact_phone})` : ""}` : "-" },
                    { label: "ที่อยู่", value: t.address ?? "-", full: true },
                    ...(t.note ? [{ label: "หมายเหตุ", value: t.note, full: true }] : []),
                  ]}
                />
              </div>
            </div>
          </Card>
          {preview && (
            <div className="flex justify-end">
              <PurgeButton kind="tenant" id={t.id} name={t.full_name} preview={preview} />
            </div>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="สัญญาเช่า" description={`${contracts.length} สัญญา`} />
            {contracts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่มีสัญญาเช่า</p>
            ) : (
              <ul className="divide-y divide-line">
                {contracts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contracts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {c.unit_code} <span className="text-sm font-normal text-muted">· {c.branch_name}</span>
                        </div>
                        <div className="text-xs text-muted">
                          {c.contract_no} · {thDate(c.start_date)} – {thDate(c.ended_on ?? c.end_date)} · {baht(c.monthly_rent)}/เดือน
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <ContractStatusBadge status={c.status} expiring={c.is_expiring} />
                        {Number(c.outstanding) > 0 && <span className="tabular text-xs text-bad">ค้าง {money(c.outstanding)}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="ใบวางบิลล่าสุด" />
            {invoices.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่มีใบวางบิล</p>
            ) : (
              <ul className="divide-y divide-line">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5">
                      <div className="min-w-0">
                        <div className="font-medium">{i.invoice_no}</div>
                        <div className="text-xs text-muted">
                          {i.unit_code} · ครบกำหนด {thDate(i.due_date)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular font-semibold">{money(i.total)}</span>
                        <InvoiceStatusBadge status={i.status} overdue={i.is_overdue} days={i.days_overdue} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
