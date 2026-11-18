/** ส่วนที่ใช้ร่วมกันของใบแจ้งหนี้และใบเสร็จ */
import type { ReactNode } from "react";
import { money, thDateLong } from "@/lib/format";
import type { InvoiceItem, InvoiceView, Tenant } from "@/lib/types";
import { InfoBox } from "./print-kit";

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 font-medium">{children}</span>
    </div>
  );
}

/** กล่องลูกค้า + กล่องรายละเอียดการเช่า วางคู่กัน */
export function PartyBoxes({ partyTitle, tenant, inv }: { partyTitle: string; tenant: Tenant; inv: InvoiceView }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 text-[14.5px] leading-relaxed">
      <InfoBox title={partyTitle}>
        <div className="space-y-0.5 px-4 py-3">
          <div className="text-[16.5px] font-bold">{tenant.full_name}</div>
          {tenant.address && <div className="whitespace-pre-line">{tenant.address}</div>}
          <div>โทร {tenant.phone}</div>
          {tenant.id_number && (
            <div className="text-muted">
              {tenant.tenant_type === "company" ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวประชาชน"} {tenant.id_number}
            </div>
          )}
        </div>
      </InfoBox>
      <InfoBox title="รายละเอียดการเช่า">
        <div className="space-y-0.5 px-4 py-3">
          <Line label="ห้อง / ช่อง">
            <span className="text-[16.5px] font-bold">{inv.unit_code}</span>
          </Line>
          <Line label="สาขา">{inv.branch_name}</Line>
          <Line label="สัญญาเลขที่">{inv.contract_no}</Line>
          {inv.period_start && (
            <Line label="รอบบิล">
              {thDateLong(inv.period_start)} – {thDateLong(inv.period_end)}
            </Line>
          )}
        </div>
      </InfoBox>
    </div>
  );
}

/** ตารางรายการ หัวดำ แถวสลับสี อ่านง่าย */
export function ItemsTable({ items, title = "รายการ", detailed = true }: { items: InvoiceItem[]; title?: string; detailed?: boolean }) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-ink/15">
      <table className="w-full border-collapse text-[14.5px]">
        <thead>
          <tr className="bg-ink text-left text-white">
            <th className="w-12 px-4 py-2 font-semibold">ลำดับ</th>
            <th className="px-3 py-2 font-semibold">{title}</th>
            {detailed && <th className="w-20 px-3 py-2 text-right font-semibold">จำนวน</th>}
            {detailed && <th className="w-32 px-3 py-2 text-right font-semibold">ราคาต่อหน่วย</th>}
            <th className="w-36 px-4 py-2 text-right font-semibold">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-t border-ink/10 even:bg-canvas">
              <td className="px-4 py-2.5 align-top text-muted">{i + 1}</td>
              <td className="px-3 py-2.5">
                {it.description}
                {!detailed && Number(it.quantity) !== 1 && (
                  <span className="text-muted">
                    {" "}
                    ({Number(it.quantity)} × {money(Math.abs(it.unit_price))})
                  </span>
                )}
              </td>
              {detailed && <td className="tabular px-3 py-2.5 text-right">{Number(it.quantity)}</td>}
              {detailed && <td className="tabular px-3 py-2.5 text-right">{money(Math.abs(it.unit_price))}</td>}
              <td className="tabular px-4 py-2.5 text-right font-medium">{money(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** สรุปยอด: แถวรอง + แถบยอดหลักสีดำตัวเลขเหลือง */
export function TotalsBox({
  rows,
  totalLabel,
  total,
}: {
  rows: { label: string; value: number | string }[];
  totalLabel: string;
  total: number | string;
}) {
  return (
    <div className="w-[21rem] shrink-0 overflow-hidden rounded-lg border border-ink/15 text-[14.5px]">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 border-b border-ink/10 px-4 py-1.5">
          <span className="text-muted">{r.label}</span>
          <span className="tabular font-medium">{money(r.value)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 bg-ink px-4 py-2.5 text-white">
        <span className="font-semibold">{totalLabel}</span>
        <span className="tabular text-[20px] font-bold text-brand">{money(total)}</span>
      </div>
    </div>
  );
}
