/**
 * ชิ้นส่วนเอกสารพิมพ์ที่ใช้ร่วมกัน (สัญญา ใบแจ้งหนี้ ใบเสร็จ) ให้หน้าตาเป็นชุดเดียวกัน
 * โทนดำ-เหลือง ตัวอักษรใหญ่อ่านง่าย ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ ใช้ในหน้าตัวอย่างได้
 */
import clsx from "clsx";
import type { ReactNode } from "react";

export type DocBusiness = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
};

export function Brand({ className }: { className?: string }) {
  return (
    <span className={clsx("font-bold tracking-tight", className)}>
      kepz<span className="text-brand-strong">.</span>
    </span>
  );
}

/** หัวกระดาษ: โลโก้ + ข้อมูลกิจการ ซ้าย / ป้ายภาษาอังกฤษ + ชื่อเอกสาร + เลขที่ ขวา */
export function BrandHeader({
  business,
  badge,
  title,
  meta,
}: {
  business: DocBusiness;
  badge: string;
  title: string;
  meta: { label: string; value: ReactNode }[];
}) {
  return (
    <header>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Brand className="block text-[40px] leading-none" />
          <div className="mt-2.5 text-[13px] leading-snug text-muted">
            <div className="text-[15px] font-semibold text-ink">{business.name}</div>
            {business.address && <div className="whitespace-pre-line">{business.address}</div>}
            {(business.phone || business.email) && (
              <div>{[business.phone && `โทร ${business.phone}`, business.email].filter(Boolean).join(" · ")}</div>
            )}
            {business.tax_id && <div>เลขประจำตัวผู้เสียภาษี {business.tax_id}</div>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="inline-block rounded-md bg-ink px-3 py-1 text-[11.5px] font-semibold tracking-[0.18em] text-brand">
            {badge}
          </div>
          <h1 className="mt-2 text-[26px] leading-tight font-bold">{title}</h1>
          <table className="mt-2 ml-auto text-left text-[13.5px] leading-normal">
            <tbody>
              {meta.map((m) => (
                <tr key={m.label}>
                  <td className="pr-3 text-muted">{m.label}</td>
                  <td className="font-semibold">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <BrandBar className="mt-4" />
    </header>
  );
}

export function BrandBar({ className }: { className?: string }) {
  return (
    <div className={clsx("flex h-1.5 overflow-hidden rounded-full", className)}>
      <div className="w-1/4 bg-ink" />
      <div className="flex-1 bg-brand" />
    </div>
  );
}

/** กล่องหัวดำ เช่น "ข้อมูลสัญญาโดยสรุป", "ลูกค้า" */
export function InfoBox({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("overflow-hidden rounded-lg border border-ink/15 break-inside-avoid", className)}>
      <div className="bg-ink px-4 py-1.5 text-[13.5px] font-semibold text-white">{title}</div>
      {children}
    </section>
  );
}

export type InfoRow = { label: string; value: ReactNode; wide?: boolean; highlight?: boolean };

function layoutRows(rows: InfoRow[]) {
  let col = 0;
  let row = -1;
  return rows.map((r) => {
    if (r.wide || col === 0) row++;
    if (r.wide) {
      col = 0;
      return { r, left: false, top: row === 0 };
    }
    const left = col === 0;
    col = left ? 1 : 0;
    return { r, left, top: row === 0 };
  });
}

/** ตาราง 2 คอลัมน์ในกล่อง: ป้ายชื่อ | ค่า (wide = เต็มแถว) */
export function InfoGrid({ rows, labelWidth = "w-32" }: { rows: InfoRow[]; labelWidth?: string }) {
  const cells = layoutRows(rows);
  return (
    <dl className="grid grid-cols-2 text-[14.5px] leading-snug">
      {cells.map(({ r, left, top }, i) => (
        <div
          key={`${r.label}-${i}`}
          className={clsx(
            "flex gap-3 border-ink/10 px-4 py-2.5",
            !top && "border-t",
            r.wide && "col-span-2",
            left && "border-r",
            r.highlight && "bg-brand-soft",
          )}
        >
          <dt className={clsx(labelWidth, "shrink-0 text-muted")}>{r.label}</dt>
          <dd className="min-w-0 font-semibold">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** เส้นว่างสำหรับเขียนด้วยมือ (ชัดและกว้างพอเขียนได้จริง) */
export function WriteLine({ width = "11em" }: { width?: string }) {
  return <span className="inline-block border-b border-ink/60 align-baseline" style={{ width, height: "1.3em" }} />;
}

/** ช่องลงนาม พร้อมชื่อผู้ลงนามในวงเล็บ */
export function SignatureBoxes({ items }: { items: { role: string; name: string | null }[] }) {
  return (
    <section className="mt-10 grid grid-cols-2 gap-6 break-inside-avoid">
      {items.map((s) => (
        <div key={s.role} className="rounded-lg border border-ink/15 px-5 pt-3 pb-5 text-center text-[14.5px]">
          <div className="text-left text-[12.5px] font-semibold tracking-wide text-muted">{s.role}</div>
          <div className="mx-auto mt-14 w-[85%] border-b border-ink/70" />
          <div className="mt-2 font-semibold">{s.name ? `(${s.name})` : <>(<WriteLine width="12em" />)</>}</div>
          <div className="mt-3 flex items-end justify-center gap-1.5 text-muted">
            วันที่ <WriteLine width="2.6em" />/<WriteLine width="2.6em" />/<WriteLine width="3.6em" />
          </div>
        </div>
      ))}
    </section>
  );
}

export function DocFooter({ business, right }: { business: DocBusiness; right: ReactNode }) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-ink/10 pt-2 text-[11.5px] text-muted">
      <span>
        <Brand /> · {business.name}
        {business.phone && ` · โทร ${business.phone}`}
      </span>
      <span>{right}</span>
    </div>
  );
}

/** แถบ "ยกเลิก" สำหรับเอกสารที่ถูกยกเลิก */
export function VoidBanner({ reason }: { reason: string | null }) {
  return (
    <div className="mb-5 rounded-lg border-2 border-bad py-2.5 text-center text-xl font-bold text-bad">
      ยกเลิก{reason ? ` — ${reason}` : ""}
    </div>
  );
}

/** กล่องยอดเงินตัวอักษร (เหลืองอ่อน) */
export function AmountWords({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-brand-soft px-4 py-2.5 text-[14.5px] font-semibold">
      <span className="mr-2 font-normal text-muted">ตัวอักษร</span>({children})
    </div>
  );
}

export function businessOf(s: {
  business_name: string;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  tax_id: string | null;
}): DocBusiness {
  return { name: s.business_name, address: s.business_address, phone: s.business_phone, email: s.business_email, tax_id: s.tax_id };
}
