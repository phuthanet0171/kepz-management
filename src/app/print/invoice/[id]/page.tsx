import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bahtText } from "@/lib/baht-text";
import { getSettings } from "@/lib/data";
import { money, thDateLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceItem, InvoiceView, Tenant } from "@/lib/types";
import { DocHeader, Paper, Signatures } from "../../doc";

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
  const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", inv.tenant_id).single();
  const tenant = tenantData as Tenant;
  const vat = Number(inv.vat_rate) > 0;

  return (
    <Paper title={`ใบแจ้งหนี้ ${inv.invoice_no}`}>
      {inv.status === "void" && (
        <div className="mb-4 rounded border-2 border-bad py-2 text-center text-lg font-bold text-bad">ยกเลิก — {inv.void_reason}</div>
      )}
      <DocHeader
        settings={settings}
        title="ใบแจ้งหนี้"
        subtitle="INVOICE"
        meta={[
          { label: "เลขที่", value: inv.invoice_no },
          { label: "วันที่", value: thDateLong(inv.issue_date) },
          { label: "ครบกำหนด", value: thDateLong(inv.due_date) },
        ]}
      />

      <section className="mb-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold text-muted">ลูกค้า</div>
          <div className="font-semibold">{tenant.full_name}</div>
          {tenant.address && <div className="whitespace-pre-line">{tenant.address}</div>}
          <div>โทร {tenant.phone}</div>
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
            <th className="py-2">รายการ</th>
            <th className="w-20 py-2 text-right">จำนวน</th>
            <th className="w-28 py-2 text-right">ราคาต่อหน่วย</th>
            <th className="w-32 py-2 text-right">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-b border-line">
              <td className="py-2 align-top">{i + 1}</td>
              <td className="py-2">{it.description}</td>
              <td className="tabular py-2 text-right">{Number(it.quantity)}</td>
              <td className="tabular py-2 text-right">{money(Math.abs(it.unit_price))}</td>
              <td className="tabular py-2 text-right">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-between gap-6 break-inside-avoid">
        <div className="flex-1 self-end rounded bg-canvas px-3 py-2 font-medium print:bg-transparent print:px-0">
          ({bahtText(Number(inv.total))})
        </div>
        <table className="w-72">
          <tbody>
            {vat && (
              <>
                <tr>
                  <td className="py-0.5 text-muted">มูลค่าก่อนภาษี</td>
                  <td className="tabular py-0.5 text-right">{money(inv.subtotal)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-muted">ภาษีมูลค่าเพิ่ม {Number(inv.vat_rate)}%</td>
                  <td className="tabular py-0.5 text-right">{money(inv.vat_amount)}</td>
                </tr>
              </>
            )}
            <tr className="border-t-2 border-ink text-base font-bold">
              <td className="py-1.5">ยอดรวมทั้งสิ้น</td>
              <td className="tabular py-1.5 text-right">{money(inv.total)}</td>
            </tr>
            {Number(inv.paid_amount) > 0 && inv.status !== "void" && (
              <>
                <tr>
                  <td className="py-0.5 text-muted">ชำระแล้ว</td>
                  <td className="tabular py-0.5 text-right">{money(inv.paid_amount)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-0.5">ยอดคงค้าง</td>
                  <td className="tabular py-0.5 text-right">{money(inv.outstanding)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {(settings.payment_instructions || inv.note) && (
        <section className="mt-6 space-y-3 break-inside-avoid">
          {settings.payment_instructions && (
            <div className="rounded border border-line p-3">
              <div className="mb-1 font-semibold">ช่องทางการชำระเงิน</div>
              <div className="whitespace-pre-line">{settings.payment_instructions}</div>
            </div>
          )}
          {inv.note && (
            <div>
              <span className="font-semibold">หมายเหตุ: </span>
              {inv.note}
            </div>
          )}
        </section>
      )}

      <Signatures left="ผู้รับวางบิล" right="ผู้วางบิล" />
    </Paper>
  );
}
