import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bahtText } from "@/lib/baht-text";
import { getSettings } from "@/lib/data";
import { money, PAYMENT_METHOD_LABEL, thDateLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceItem, InvoiceView, Payment, Tenant } from "@/lib/types";
import { DocHeader, Paper, Signatures } from "../../doc";

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
  const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", inv.tenant_id).single();
  const tenant = tenantData as Tenant;

  // VAT ตามอัตราที่ใช้ตอนออกใบแจ้งหนี้ ยอดรับชำระรวม VAT แล้วเสมอ
  const rate = Number(inv.vat_rate);
  const isTaxInvoice = rate > 0;
  const amount = Number(p.amount);
  const vatPart = isTaxInvoice ? Math.round(((amount * rate) / (100 + rate)) * 100) / 100 : 0;
  const isFull = amount === Number(inv.total);

  return (
    <Paper title={`ใบเสร็จ ${p.receipt_no}`}>
      {p.is_void && (
        <div className="mb-4 rounded border-2 border-bad py-2 text-center text-lg font-bold text-bad">ยกเลิก — {p.void_reason}</div>
      )}
      <DocHeader
        settings={settings}
        title={isTaxInvoice ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}
        subtitle={isTaxInvoice ? "RECEIPT / TAX INVOICE" : "RECEIPT"}
        meta={[
          { label: "เลขที่", value: p.receipt_no },
          { label: "วันที่", value: thDateLong(p.paid_on) },
          { label: "อ้างอิงใบแจ้งหนี้", value: inv.invoice_no },
        ]}
      />

      <section className="mb-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold text-muted">ได้รับเงินจาก</div>
          <div className="font-semibold">{tenant.full_name}</div>
          {tenant.address && <div className="whitespace-pre-line">{tenant.address}</div>}
          {tenant.id_number && (
            <div>
              {tenant.tenant_type === "company" ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวประชาชน"} {tenant.id_number}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">รายละเอียดการเช่า</div>
          <div>
            สาขา {inv.branch_name} · ห้อง <b>{inv.unit_code}</b>
          </div>
          <div>สัญญาเลขที่ {inv.contract_no}</div>
          {inv.period_start && (
            <div>
              รอบบิล {thDateLong(inv.period_start)} – {thDateLong(inv.period_end)}
            </div>
          )}
        </div>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-ink text-left">
            <th className="w-10 py-2">#</th>
            <th className="py-2">รายการตามใบแจ้งหนี้ {inv.invoice_no}</th>
            <th className="w-32 py-2 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-b border-line">
              <td className="py-2">{i + 1}</td>
              <td className="py-2">
                {it.description}
                {Number(it.quantity) !== 1 && (
                  <span className="text-muted">
                    {" "}
                    ({Number(it.quantity)} × {money(Math.abs(it.unit_price))})
                  </span>
                )}
              </td>
              <td className="tabular py-2 text-right">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end break-inside-avoid">
        <table className="w-80">
          <tbody>
            <tr>
              <td className="py-0.5 text-muted">ยอดตามใบแจ้งหนี้</td>
              <td className="tabular py-0.5 text-right">{money(inv.total)}</td>
            </tr>
            {isTaxInvoice && (
              <>
                <tr>
                  <td className="py-0.5 text-muted">มูลค่าสินค้า/บริการ (รับครั้งนี้)</td>
                  <td className="tabular py-0.5 text-right">{money(amount - vatPart)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted">ภาษีมูลค่าเพิ่ม {rate}%</td>
                  <td className="tabular py-0.5 text-right">{money(vatPart)}</td>
                </tr>
              </>
            )}
            <tr className="border-t-2 border-ink text-base font-bold">
              <td className="py-1.5">{isFull ? "รับชำระ" : "รับชำระครั้งนี้"}</td>
              <td className="tabular py-1.5 text-right">{money(amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded bg-canvas px-3 py-2 font-medium print:bg-transparent print:px-0">({bahtText(amount)})</div>

      <section className="mt-4 break-inside-avoid">
        <div>
          ชำระโดย: <b>{PAYMENT_METHOD_LABEL[p.method]}</b>
          {p.reference && <> · อ้างอิง {p.reference}</>}
        </div>
        {!isFull && <div className="text-muted">ชำระบางส่วนของใบแจ้งหนี้ {inv.invoice_no}</div>}
        {p.note && <div>หมายเหตุ: {p.note}</div>}
      </section>

      <Signatures left="ผู้จ่ายเงิน" right="ผู้รับเงิน" />
    </Paper>
  );
}
