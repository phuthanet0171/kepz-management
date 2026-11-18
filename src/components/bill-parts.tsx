/** ส่วนที่ใช้ร่วมกันของใบวางบิลและใบเสร็จ (เรียบ โล่ง ใช้เส้นคั่นแทนกล่อง) */
import type { ReactNode } from "react";
import { money, thDateLong } from "@/lib/format";
import type { InvoiceItem, InvoiceView, Tenant } from "@/lib/types";
import { SectionLabel } from "./print-kit";

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className="min-w-0 font-medium">{children}</span>
    </div>
  );
}

/** ลูกค้า | รายละเอียดการเช่า วางคู่กัน ไม่มีกรอบ */
export function PartyBoxes({ partyTitle, tenant, inv }: { partyTitle: string; tenant: Tenant; inv: InvoiceView }) {
  return (
    <div className="mt-7 grid grid-cols-2 gap-10 text-[14.5px] leading-relaxed">
      <div>
        <SectionLabel>{partyTitle}</SectionLabel>
        <div className="text-[17px] font-bold">{tenant.full_name}</div>
        {tenant.address && <div className="whitespace-pre-line">{tenant.address}</div>}
        <div>โทร {tenant.phone}</div>
        {tenant.id_number && (
          <div className="text-muted">
            {tenant.tenant_type === "company" ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวประชาชน"} {tenant.id_number}
          </div>
        )}
      </div>
      <div>
        <SectionLabel>รายละเอียดการเช่า</SectionLabel>
        <Line label="ห้อง / ช่อง">
          <span className="text-[17px] font-bold">{inv.unit_code}</span>
        </Line>
        <Line label="สาขา">{inv.branch_name}</Line>
        <Line label="สัญญาเลขที่">{inv.contract_no}</Line>
        {inv.period_start && (
          <Line label="รอบบิล">
            {thDateLong(inv.period_start)} – {thDateLong(inv.period_end)}
          </Line>
        )}
      </div>
    </div>
  );
}

/** ตารางรายการ: หัวดำ แถวคั่นด้วยเส้นบาง ไม่มีกรอบรอบนอก */
export function ItemsTable({ items, title = "รายการ", detailed = true }: { items: InvoiceItem[]; title?: string; detailed?: boolean }) {
  return (
    <table className="mt-7 w-full border-separate border-spacing-0 text-[14.5px] [&_tbody_td]:border-b [&_tbody_td]:border-ink/10">
      <thead>
        <tr className="bg-ink text-left text-white">
          <th className="w-14 rounded-l-md px-4 py-2 font-semibold">ลำดับ</th>
          <th className="px-3 py-2 font-semibold">{title}</th>
          {detailed && <th className="w-20 px-3 py-2 text-right font-semibold">จำนวน</th>}
          {detailed && <th className="w-32 px-3 py-2 text-right font-semibold">ราคาต่อหน่วย</th>}
          <th className="w-36 rounded-r-md px-4 py-2 text-right font-semibold">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={it.id}>
            <td className="px-4 py-3 align-top text-muted">{i + 1}</td>
            <td className="px-3 py-3">
              {it.description}
              {!detailed && Number(it.quantity) !== 1 && (
                <span className="text-muted">
                  {" "}
                  ({Number(it.quantity)} × {money(Math.abs(it.unit_price))})
                </span>
              )}
            </td>
            {detailed && <td className="tabular px-3 py-3 text-right">{Number(it.quantity)}</td>}
            {detailed && <td className="tabular px-3 py-3 text-right">{money(Math.abs(it.unit_price))}</td>}
            <td className="tabular px-4 py-3 text-right font-medium">{money(it.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** สรุปยอด: แถวรองเรียบๆ + แถบยอดหลักสีดำตัวเลขเหลือง */
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
    <div className="w-[20rem] shrink-0 text-[14.5px]">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 px-4 py-1">
          <span className="text-muted">{r.label}</span>
          <span className="tabular font-medium">{money(r.value)}</span>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between gap-4 rounded-md bg-ink px-4 py-3 text-white">
        <span className="font-semibold">{totalLabel}</span>
        <span className="tabular text-[22px] font-bold text-[var(--doc-accent,#ffd21f)]">{money(total)}</span>
      </div>
    </div>
  );
}
