import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemsTable, PartyBoxes, TotalsBox } from "@/components/bill-parts";
import { BrandHeader, businessOf, DocFooter, SectionLabel, SignatureBoxes, VoidBanner } from "@/components/print-kit";
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

  // VAT ตามอัตราที่ใช้ตอนออกใบวางบิล ยอดรับชำระรวม VAT แล้วเสมอ
  const rate = Number(inv.vat_rate);
  const isTaxInvoice = rate > 0;
  const amount = Number(p.amount);
  const isFull = amount === Number(inv.total);
  const hasWht = Number(inv.wht_rate) > 0;
  // แบ่งภาษีตามสัดส่วนยอดที่รับครั้งนี้ (ยอดรับ = ยอดหลังหัก ณ ที่จ่าย)
  const share = Number(inv.total) > 0 ? amount / Number(inv.total) : 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const whtPart = hasWht ? (isFull ? Number(inv.wht_amount) : r2(Number(inv.wht_amount) * share)) : 0;
  const grossPart = r2(amount + whtPart);
  const vatPart = isTaxInvoice ? (isFull ? Number(inv.vat_amount) : r2(Number(inv.vat_amount) * share)) : 0;

  const rows: { label: string; value: number | string }[] = [];
  if (!isFull) rows.push({ label: "ยอดตามใบวางบิล", value: inv.total });
  if (isTaxInvoice) {
    rows.push({ label: isFull ? "มูลค่าบริการ" : "มูลค่าบริการ (รับครั้งนี้)", value: r2(grossPart - vatPart) });
    rows.push({ label: `ภาษีมูลค่าเพิ่ม ${rate}%`, value: vatPart });
  }
  if (hasWht) {
    rows.push({ label: isTaxInvoice ? "รวมเป็นเงิน" : "ค่าเช่าและบริการ", value: grossPart });
    rows.push({ label: `หัก ณ ที่จ่าย ${Number(inv.wht_rate)}%`, value: -whtPart });
  }

  return (
    <Paper title={`ใบเสร็จ ${p.receipt_no}`} tone="receipt">
      {p.is_void && <VoidBanner reason={p.void_reason} />}
      <BrandHeader
        business={business}
        badge={isTaxInvoice ? "RECEIPT / TAX INVOICE" : "RECEIPT"}
        title={isTaxInvoice ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}
        meta={[
          { label: "เลขที่", value: p.receipt_no },
          { label: "วันที่รับเงิน", value: thDateLong(p.paid_on) },
          { label: "อ้างอิงใบวางบิล", value: inv.invoice_no },
        ]}
      />

      <PartyBoxes partyTitle="ได้รับเงินจาก" tenant={tenant} inv={inv} />
      <ItemsTable items={items} title={`รายการตามใบวางบิล ${inv.invoice_no}`} detailed={false} />

      <div className="mt-5 flex items-start justify-between gap-10 break-inside-avoid">
        <div className="min-w-0 flex-1 space-y-4 pt-1 text-[14.5px]">
          <div>
            <SectionLabel>การชำระเงิน</SectionLabel>
            <div>
              ชำระโดย <b>{PAYMENT_METHOD_LABEL[p.method]}</b>
              {p.reference && <span className="text-muted"> · อ้างอิง {p.reference}</span>}
            </div>
            <div className={isFull ? "font-semibold text-ok" : "text-muted"}>
              {isFull ? "✓ ชำระครบตามใบวางบิลแล้ว" : `ชำระบางส่วนของใบวางบิล ${inv.invoice_no}`}
            </div>
          </div>
          {p.note && (
            <div>
              <SectionLabel>หมายเหตุ</SectionLabel>
              <div>{p.note}</div>
            </div>
          )}
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
