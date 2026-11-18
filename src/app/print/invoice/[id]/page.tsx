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

export const metadata: Metadata = { title: "ใบวางบิล" };

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
  const wht = Number(inv.wht_rate) > 0;
  const paid = Number(inv.paid_amount) > 0 && inv.status !== "void";
  const payTo = settings.payment_instructions || terms.bank_account;

  const rows: { label: string; value: number | string }[] = [];
  if (vat) {
    rows.push({ label: "มูลค่าก่อนภาษี", value: inv.subtotal });
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${Number(inv.vat_rate)}%`, value: inv.vat_amount });
  }
  if (wht) {
    rows.push({ label: vat ? "รวมเป็นเงิน" : "ค่าเช่าและบริการ", value: Number(inv.subtotal) + Number(inv.vat_amount) });
    rows.push({ label: `หัก ณ ที่จ่าย ${Number(inv.wht_rate)}%`, value: -Number(inv.wht_amount) });
  }
  if (paid) {
    rows.push({ label: wht ? "ยอดชำระสุทธิ" : "ยอดรวมทั้งสิ้น", value: inv.total });
    rows.push({ label: "ชำระแล้ว", value: inv.paid_amount });
  }
  const due = paid ? inv.outstanding : inv.total;

  return (
    <Paper title={`ใบวางบิล ${inv.invoice_no}`} tone="bill">
      {inv.status === "void" && <VoidBanner reason={inv.void_reason} />}
      <BrandHeader
        business={business}
        badge="BILLING NOTE"
        title="ใบวางบิล"
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
              <div className="text-[17px] leading-relaxed font-bold whitespace-pre-line">{payTo}</div>
            </div>
          )}
          {inv.note && (
            <div>
              <SectionLabel>หมายเหตุ</SectionLabel>
              <div>{inv.note}</div>
            </div>
          )}
        </div>
        <TotalsBox rows={rows} totalLabel={paid ? "ยอดคงค้างที่ต้องชำระ" : wht ? "ยอดชำระสุทธิ" : "ยอดที่ต้องชำระ"} total={due} />
      </div>

      <SignatureBoxes
        items={[
          { role: "ผู้รับวางบิล", name: tenant.full_name },
          { role: "ผู้วางบิล", name: terms.lessor_name },
        ]}
      />
      <DocFooter business={business} right={`ใบวางบิลเลขที่ ${inv.invoice_no}`} />
    </Paper>
  );
}
