/** ส่วนที่ใช้ร่วมกันของใบวางบิลและใบเสร็จ (เรียบ โล่ง ใช้เส้นคั่นแทนกล่อง) */
import type { ReactNode } from "react";
import { bahtText } from "@/lib/baht-text";
import { money, thDateLong } from "@/lib/format";
import clsx from "clsx";
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
      <div className="mt-1 rounded-md bg-[var(--doc-totalBg,#111111)] px-4 py-3 text-[var(--doc-totalFg,#ffffff)]">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold">{totalLabel}</span>
          <span className="tabular text-[22px] font-bold text-[var(--doc-totalNum,#ffd21f)]">{money(total)}</span>
        </div>
        {/* จำนวนเงินตัวอักษร */}
        <div
          className="mt-1.5 border-t pt-1.5 text-right text-[13px] opacity-80"
          style={{ borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}
        >({bahtText(Number(total))})</div>
      </div>
    </div>
  );
}

/**
 * ใบวางบิล: แถบ "ยอดที่ต้องชำระ" ใต้หัวกระดาษ (เหลือง) + กำหนดชำระ (ดำ)
 * ให้ลูกค้าเห็นทันทีว่าต้องจ่ายเท่าไหร่ ภายในวันไหน
 */
export function BillDuePanel({ amount, dueDate, settled }: { amount: number | string; dueDate: string; settled: boolean }) {
  if (settled) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-lg border-2 border-ok bg-ok-soft px-5 py-3 text-ok break-inside-avoid">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ok text-lg font-bold text-white">✓</span>
        <span className="text-[17px] font-bold">ใบวางบิลนี้ชำระครบแล้ว</span>
      </div>
    );
  }
  return (
    <div className="mt-6 flex overflow-hidden rounded-lg break-inside-avoid">
      <div className="flex-1 bg-[#ffd21f] px-5 py-3.5 text-ink">
        <div className="text-[13.5px] font-semibold">ยอดที่ต้องชำระ</div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="tabular text-[34px] leading-tight font-bold">{money(amount)}</span>
          <span className="text-[15px] font-semibold">บาท</span>
          <span className="text-[13.5px]">({bahtText(Number(amount))})</span>
        </div>
      </div>
      <div className="flex w-[15rem] shrink-0 flex-col justify-center bg-ink px-5 py-3.5 text-white">
        <div className="text-[13.5px] font-semibold text-[#ffd21f]">กรุณาชำระภายใน</div>
        <div className="text-[20px] leading-snug font-bold">{thDateLong(dueDate)}</div>
      </div>
    </div>
  );
}

/** ใบวางบิล: กล่องช่องทางชำระเงิน ขอบเหลืองหนา ตัวใหญ่ เลขบัญชีอ่านง่าย */
export function PayToBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-[#e0b400] bg-[#fffbe6] px-4 py-3">
      <div className="text-[13px] font-semibold text-muted">ช่องทางการชำระเงิน · โอนแล้วกรุณาส่งสลิปแจ้ง</div>
      <div className="mt-1 text-[18px] leading-relaxed font-bold whitespace-pre-line">{text}</div>
    </div>
  );
}

/**
 * ใบเสร็จ: แถบยืนยัน "ได้รับเงินแล้ว" สีเขียว ใต้หัวกระดาษ
 * เขียว = จ่ายแล้ว อ่านเข้าใจทันทีโดยไม่ต้องอ่านตัวหนังสือ
 */
export function ReceiptPaidPanel({
  amount,
  paidOn,
  method,
  full,
}: {
  amount: number;
  paidOn: string;
  method: string;
  full: boolean;
}) {
  return (
    <div className="mt-6 flex items-center gap-4 rounded-lg border-2 border-ok bg-ok-soft px-5 py-3.5 break-inside-avoid">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok text-2xl font-bold text-white">✓</span>
      <div className="min-w-0 flex-1">
        <div className="text-[19px] leading-tight font-bold text-ok">
          {full ? "ได้รับเงินเรียบร้อยแล้ว" : "ได้รับเงินแล้ว (ชำระบางส่วน)"}
        </div>
        <div className="text-[13.5px] text-ink-2">
          วันที่ {thDateLong(paidOn)} · {method}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] text-ink-2">จำนวนเงิน</div>
        <div className="tabular text-[26px] leading-tight font-bold text-ink">{money(amount)}</div>
      </div>
    </div>
  );
}

/** ตราประทับ "ชำระแล้ว PAID" เอียง สีเขียว ใช้บนใบเสร็จ */
export function PaidStamp({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "inline-flex -rotate-[8deg] flex-col items-center rounded-lg border-[3px] border-double border-ok px-5 py-1.5 text-ok opacity-85",
        className,
      )}
    >
      <span className="text-[22px] leading-tight font-bold">ชำระแล้ว</span>
      <span className="text-[12px] font-bold tracking-[0.35em]">PAID</span>
    </div>
  );
}
