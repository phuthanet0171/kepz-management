/**
 * ชิ้นส่วนเอกสารพิมพ์ที่ใช้ร่วมกัน (สัญญา ใบวางบิล ใบเสร็จ) ให้หน้าตาเป็นชุดเดียวกัน
 * โทนดำ-เหลือง ตัวอักษรใหญ่อ่านง่าย ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ ใช้ในหน้าตัวอย่างได้
 */
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

/**
 * สีประจำเอกสาร ใช้แค่ เหลือง-ดำ-เทา แต่จัดน้ำหนักต่างกันให้แยกออกทันที
 *  สัญญา   = ดำเด่น ตัวเหลือง (แบบเดิม)
 *  ใบวางบิล = เหลืองเด่น (แถบยอดที่ต้องจ่ายด้านบน + กล่องบัญชีเทา)
 *  ใบเสร็จ  = เทาเด่น (กล่องยอดรับดำตัวเลขเหลืองด้านล่าง + ตรา PAID)
 */
export type DocTone = "contract" | "bill" | "receipt";
const Y = "#ffd21f";
const K = "#111111";
const G = "#6b6b6b";
const TONES: Record<DocTone, Record<string, string>> = {
  contract: { badgeBg: K, badgeFg: Y, barA: K, barB: Y, totalBg: K, totalFg: "#ffffff", totalNum: Y, line: Y },
  bill: { badgeBg: Y, badgeFg: K, barA: Y, barB: K, totalBg: Y, totalFg: K, totalNum: K, line: Y },
  receipt: { badgeBg: G, badgeFg: "#ffffff", barA: G, barB: K, totalBg: K, totalFg: "#ffffff", totalNum: Y, line: G },
};
export function toneStyle(tone: DocTone): CSSProperties {
  const t = TONES[tone];
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--doc-${k}`, v])) as CSSProperties;
}

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
          <div className="inline-block rounded-md bg-[var(--doc-badgeBg,#111111)] px-3 py-1 text-[11.5px] font-semibold tracking-[0.18em] text-[var(--doc-badgeFg,#ffd21f)]">
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
      <div className="w-1/4 bg-[var(--doc-barA,#111111)]" />
      <div className="flex-1 bg-[var(--doc-barB,#ffd21f)]" />
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

/** ช่องลงนาม: เส้นเซ็นชื่อ + ชื่อในวงเล็บ + วันที่ (ไม่มีกรอบ ให้หน้าเอกสารโล่งตา) */
export function SignatureBoxes({ items }: { items: { role: string; name: string | null }[] }) {
  return (
    <section className="mt-14 grid grid-cols-2 gap-12 text-center text-[14.5px] break-inside-avoid">
      {items.map((s) => (
        <div key={s.role}>
          <div className="mx-auto w-[80%] border-b border-ink/70 pt-10" />
          <div className="mt-2 font-semibold">{s.name ? `(${s.name})` : <>(<WriteLine width="12em" />)</>}</div>
          <div className="text-muted">{s.role}</div>
          <div className="mt-2 flex items-end justify-center gap-1.5 text-muted">
            วันที่ <WriteLine width="2.6em" />/<WriteLine width="2.6em" />/<WriteLine width="3.6em" />
          </div>
        </div>
      ))}
    </section>
  );
}

/** หัวข้อส่วนเล็ก ขีดสีประจำเอกสารด้านล่าง ใช้แทนกล่องเพื่อลดเส้นกรอบ */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 inline-block border-b-[3px] border-[var(--doc-line,#ffd21f)] pb-0.5 text-[13px] font-semibold tracking-wide text-muted">
      {children}
    </div>
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

export function businessOf(s: {
  business_name: string;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  tax_id: string | null;
}): DocBusiness {
  return { name: s.business_name, address: s.business_address, phone: s.business_phone, email: s.business_email, tax_id: s.tax_id };
}
