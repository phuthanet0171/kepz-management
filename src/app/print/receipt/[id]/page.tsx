import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemsTable, PartyBoxes, TotalsBox } from "@/components/bill-parts";
import { AmountWords, BrandHeader, businessOf, DocFooter, InfoBox, SignatureBoxes, VoidBanner } from "@/components/print-kit";
import { bahtText } from "@/lib/baht-text";
import { resolveContractTerms } from "@/lib/contract-template";
import { getSettings } from "@/lib/data";
import { PAYMENT_METHOD_LABEL, thDateLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Branch, InvoiceItem, InvoiceView, Payment, Tenant } from "@/lib/types";
import { Paper } from "../../doc";

export const metadata: Metadata = { title: "ใบเสร็จรับเงิน" };

export default async function PrintReceiptPage({ params }: PageProps<"/print/receipt/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: payData } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  if (!payData) notFound();
  const p = payData as Payment;

  const [{ data: invData }, { data: itemData }, settings] = await Promise.all([
    supabase.from("v_invoices").select("*").eq("id", p.invoice_id).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", p.invoice_id).order("sort_order"),
    getSettings(),
  ]);
  const inv = invData as InvoiceView;
  const items = (itemData ?? []) as InvoiceItem[];
  const [{ data: tenantData }, { data: branchData }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", inv.tenant_id).single(),
    supabase.from("branches").select("*").eq("id", inv.branch_id).maybeSingle(),
  ]);
  const tenant = tenantData as Tenant;
  const terms = resolveContractTerms(settings, branchData as Branch | null);
  const business = businessOf(settings);

  // VAT ตามอัตราที่ใช้ตอนออกใบแจ้งหนี้ ยอดรับชำระรวม VAT แล้วเสมอ
  const rate = Number(inv.vat_rate);
  const isTaxInvoice = rate > 0;
  const amount = Number(p.amount);
  const vatPart = isTaxInvoice ? Math.round(((amount * rate) / (100 + rate)) * 100) / 100 : 0;
  const isFull = amount === Number(inv.total);

  const rows: { label: string; value: number | string }[] = [{ label: "ยอดตามใบแจ้งหนี้", value: inv.total }];
  if (isTaxInvoice) {
    rows.push({ label: "มูลค่าบริการ (รับครั้งนี้)", value: amount - vatPart });
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${rate}%`, value: vatPart });
  }

  return (
    <Paper title={`ใบเสร็จ ${p.receipt_no}`}>
      {p.is_void && <VoidBanner reason={p.void_reason} />}
      <BrandHeader
        business={business}
        badge={isTaxInvoice ? "RECEIPT / TAX INVOICE" : "RECEIPT"}
        title={isTaxInvoice ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}
        meta={[
          { label: "เลขที่", value: p.receipt_no },
          { label: "วันที่รับเงิน", value: thDateLong(p.paid_on) },
          { label: "อ้างอิงใบแจ้งหนี้", value: inv.invoice_no },
        ]}
      />

      <PartyBoxes partyTitle="ได้รับเงินจาก" tenant={tenant} inv={inv} />
      <ItemsTable items={items} title={`รายการตามใบแจ้งหนี้ ${inv.invoice_no}`} detailed={false} />

      <div className="mt-4 flex items-start justify-between gap-6 break-inside-avoid">
        <div className="min-w-0 flex-1 space-y-3">
          <AmountWords>{bahtText(amount)}</AmountWords>
          <InfoBox title="การชำระเงิน">
            <div className="space-y-0.5 px-4 py-3 text-[14.5px]">
              <div>
                ชำระโดย <b>{PAYMENT_METHOD_LABEL[p.method]}</b>
                {p.reference && <span className="text-muted"> · อ้างอิง {p.reference}</span>}
              </div>
              <div className={isFull ? "font-semibold text-ok" : "text-muted"}>
                {isFull ? "✓ ชำระครบตามใบแจ้งหนี้แล้ว" : `ชำระบางส่วนของใบแจ้งหนี้ ${inv.invoice_no}`}
              </div>
              {p.note && <div>หมายเหตุ: {p.note}</div>}
            </div>
          </InfoBox>
        </div>
        <TotalsBox rows={rows} totalLabel={isFull ? "รับชำระ" : "รับชำระครั้งนี้"} total={amount} />
      </div>

      <SignatureBoxes
        items={[
          { role: "ผู้จ่ายเงิน", name: tenant.full_name },
          { role: "ผู้รับเงิน", name: terms.lessor_name },
        ]}
      />
      <DocFooter business={business} right={`ใบเสร็จเลขที่ ${p.receipt_no}`} />
    </Paper>
  );
}
