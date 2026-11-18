import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemsTable, PartyBoxes, TotalsBox } from "@/components/bill-parts";
import { BrandHeader, businessOf, DocFooter, SectionLabel, SignatureBoxes, VoidBanner } from "@/components/print-kit";
import { resolveContractTerms } from "@/lib/contract-template";
import { getSettings } from "@/lib/data";
import { thDateLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Branch, InvoiceItem, InvoiceView, Tenant } from "@/lib/types";
import { Paper } from "../../doc";

export const metadata: Metadata = { title: "ใบแจ้งหนี้" };

export default async function PrintInvoicePage({ params }: PageProps<"/print/invoice/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invData }, { data: itemData }, settings] = await Promise.all([
    supabase.from("v_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    getSettings(),
  ]);
  if (!invData) notFound();
  const inv = invData as InvoiceView;
  const items = (itemData ?? []) as InvoiceItem[];
  const [{ data: tenantData }, { data: branchData }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", inv.tenant_id).single(),
    supabase.from("branches").select("*").eq("id", inv.branch_id).maybeSingle(),
  ]);
  const tenant = tenantData as Tenant;
  const terms = resolveContractTerms(settings, branchData as Branch | null);
  const business = businessOf(settings);
  const vat = Number(inv.vat_rate) > 0;
  const paid = Number(inv.paid_amount) > 0 && inv.status !== "void";
  const payTo = settings.payment_instructions || terms.bank_account;

  const rows: { label: string; value: number | string }[] = [];
  if (vat) {
    rows.push({ label: "มูลค่าก่อนภาษี", value: inv.subtotal });
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${Number(inv.vat_rate)}%`, value: inv.vat_amount });
  }
  if (paid) {
    rows.push({ label: "ยอดรวมทั้งสิ้น", value: inv.total });
    rows.push({ label: "ชำระแล้ว", value: inv.paid_amount });
  }
  const due = paid ? inv.outstanding : inv.total;

  return (
    <Paper title={`ใบแจ้งหนี้ ${inv.invoice_no}`}>
      {inv.status === "void" && <VoidBanner reason={inv.void_reason} />}
      <BrandHeader
        business={business}
        badge="INVOICE"
        title="ใบแจ้งหนี้"
        meta={[
          { label: "เลขที่", value: inv.invoice_no },
          { label: "วันที่ออก", value: thDateLong(inv.issue_date) },
          { label: "ครบกำหนดชำระ", value: thDateLong(inv.due_date) },
        ]}
      />

      <PartyBoxes partyTitle="ลูกค้า" tenant={tenant} inv={inv} />
      <ItemsTable items={items} />

      <div className="mt-5 flex items-start justify-between gap-10 break-inside-avoid">
        <div className="min-w-0 flex-1 space-y-4 pt-1 text-[14.5px]">
          {inv.status !== "void" && Number(due) > 0 && (
            <div>
              <SectionLabel>กำหนดชำระ</SectionLabel>
              <div>
                กรุณาชำระภายใน <b className="text-[16.5px]">{thDateLong(inv.due_date)}</b>
              </div>
            </div>
          )}
          {payTo && (
            <div>
              <SectionLabel>ช่องทางการชำระเงิน</SectionLabel>
              <div className="whitespace-pre-line">{payTo}</div>
            </div>
          )}
          {inv.note && (
            <div>
              <SectionLabel>หมายเหตุ</SectionLabel>
              <div>{inv.note}</div>
            </div>
          )}
        </div>
        <TotalsBox rows={rows} totalLabel={paid ? "ยอดคงค้างที่ต้องชำระ" : "ยอดที่ต้องชำระ"} total={due} />
      </div>

      <SignatureBoxes
        items={[
          { role: "ผู้รับวางบิล", name: tenant.full_name },
          { role: "ผู้วางบิล", name: terms.lessor_name },
        ]}
      />
      <DocFooter business={business} right={`ใบแจ้งหนี้เลขที่ ${inv.invoice_no}`} />
    </Paper>
  );
}
