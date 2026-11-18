import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillDuePanel, ItemsTable, PartyBoxes, PayToBox, type FootRow } from "@/components/bill-parts";
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

  // แถวสรุปใต้ตาราง: แสดงเฉพาะเมื่อมีภาษี/มีการชำระแล้ว (ยอดที่ต้องจ่ายอยู่ในแถบเหลืองด้านบนที่เดียว)
  const foot: FootRow[] = [];
  if (vat) {
    foot.push({ label: "มูลค่าก่อนภาษี", value: inv.subtotal });
    foot.push({ label: `ภาษีมูลค่าเพิ่ม ${Number(inv.vat_rate)}%`, value: inv.vat_amount });
  }
  if (wht) {
    foot.push({ label: vat ? "รวมเป็นเงิน" : "ค่าเช่าและบริการ", value: Number(inv.subtotal) + Number(inv.vat_amount) });
    foot.push({ label: `หัก ณ ที่จ่าย ${Number(inv.wht_rate)}%`, value: -Number(inv.wht_amount), tone: "bad" });
  }
  const isVoid = inv.status === "void";
  if (foot.length || paid || isVoid) foot.push({ label: wht ? "ยอดชำระสุทธิ" : "ยอดรวมทั้งสิ้น", value: inv.total, strong: true });
  if (paid) foot.push({ label: "ชำระแล้ว", value: -Number(inv.paid_amount) });
  const due = paid ? Number(inv.outstanding) : Number(inv.total);
  const showDue = !isVoid && due > 0;

  return (
    <Paper title={`ใบวางบิล ${inv.invoice_no}`} tone="bill">
      {isVoid && <VoidBanner reason={inv.void_reason} />}
      <BrandHeader
        business={business}
        badge="BILLING NOTE"
        title="ใบวางบิล"
        meta={[
          { label: "เลขที่", value: inv.invoice_no },
          { label: "วันที่ออก", value: thDateLong(inv.issue_date) },
          // วันครบกำหนดอยู่ในแถบดำด้านบนแล้ว ไม่ต้องซ้ำ
          ...(showDue ? [] : [{ label: "ครบกำหนดชำระ", value: thDateLong(inv.due_date) }]),
        ]}
      />

      {!isVoid && (
        <BillDuePanel
          label={paid ? "ยอดคงค้างที่ต้องชำระ" : wht ? "ยอดชำระสุทธิ" : "ยอดที่ต้องชำระ"}
          amount={due}
          dueDate={inv.due_date}
          settled={!showDue}
        />
      )}

      <PartyBoxes partyTitle="ลูกค้า" tenant={tenant} inv={inv} />
      <ItemsTable items={items} foot={foot} />

      {(payTo || inv.note) && (
        <div className="mt-6 space-y-4 break-inside-avoid">
          {payTo && showDue && <PayToBox text={payTo} />}
          {inv.note && (
            <div className="text-[14.5px]">
              <SectionLabel>หมายเหตุ</SectionLabel>
              <div>{inv.note}</div>
            </div>
          )}
        </div>
      )}

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
