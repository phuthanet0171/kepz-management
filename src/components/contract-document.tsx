import clsx from "clsx";
import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/contract-template";
import type { UnitKind } from "@/lib/types";

const BLANK = "……………………………";

export type ContractBusiness = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
};

function Parts({ parts, preview }: { parts: Inline[]; preview?: boolean }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "text") return p.bold ? <b key={i}>{p.v}</b> : <span key={i}>{p.v}</span>;
        // ช่องที่ไม่รู้จัก: แสดงตามที่พิมพ์ไว้ (หน้าแก้แม่แบบจะไฮไลต์ให้เห็น)
        if (p.v === null) {
          return (
            <span key={i} className={clsx(p.bold && "font-bold", preview && "rounded bg-bad/15 px-0.5 text-bad")}>
              {`{${p.key}}`}
            </span>
          );
        }
        // ช่องว่าง: เว้นเส้นจุดไว้ให้เขียนด้วยมือ
        if (!p.v) {
          return (
            <span key={i} className={clsx("text-muted", preview && "rounded bg-brand-soft")} title={preview ? `{${p.key}} ยังไม่มีข้อมูล` : undefined}>
              {BLANK}
            </span>
          );
        }
        // ข้อมูลที่เติมให้: ตัวหนาเล็กน้อย ขีดเส้นจุดใต้ ให้ดูเหมือนช่องกรอกในแบบฟอร์ม
        return (
          <span
            key={i}
            className={clsx(
              "border-b border-dotted border-ink/50 px-0.5 font-semibold",
              p.bold && "font-bold",
              preview && "rounded-sm bg-brand-soft/70",
            )}
          >
            {p.v}
          </span>
        );
      })}
    </>
  );
}

type SummaryItem = { label: string; value: ReactNode; wide?: boolean; highlight?: boolean };

/** จัดรายการเป็น 2 คอลัมน์ บอกว่าช่องไหนอยู่ซ้าย (ต้องมีเส้นคั่นด้านขวา) */
function withColumns(items: SummaryItem[]) {
  let col = 0;
  return items.map((s) => {
    if (s.wide) {
      col = 0;
      return { s, left: false };
    }
    const left = col === 0;
    col = left ? 1 : 0;
    return { s, left };
  });
}

function plainText(parts: Inline[]) {
  return parts.map((p) => (p.t === "text" ? p.v : (p.v ?? `{${p.key}}`))).join("");
}

export function ContractDocument({
  blocks,
  fields,
  kind,
  business,
  lessorName,
  tenantName,
  preview,
}: {
  blocks: Block[];
  fields: Record<string, string>;
  kind: UnitKind;
  business: ContractBusiness;
  lessorName: string | null;
  tenantName: string;
  preview?: boolean;
}) {
  // หัวเรื่องแรกของแม่แบบ (# ...) ย้ายไปแสดงที่หัวกระดาษ
  const titleIdx = blocks.findIndex((b) => b.kind === "title");
  const title =
    titleIdx >= 0 && "parts" in blocks[titleIdx]
      ? plainText((blocks[titleIdx] as { parts: Inline[] }).parts)
      : kind === "parking"
        ? "สัญญาเช่าที่จอดรถ"
        : "สัญญาเช่าห้องเก็บของ";
  const body = blocks.filter((_, i) => i !== titleIdx);
  while (body[0]?.kind === "gap") body.shift();

  const parking = kind === "parking";
  const v = (k: string) => fields[k] || "-";
  const summary: SummaryItem[] = [
    { label: "ผู้เช่า", value: v("ชื่อผู้เช่า") },
    { label: "เบอร์โทร", value: v("เบอร์ผู้เช่า") },
    {
      label: parking ? "ช่องจอด" : "ห้องเก็บของ",
      value: (
        <>
          {v("เลขห้อง")} <span className="font-normal text-muted">· {v("ประเภทห้อง")}{fields["ขนาดห้อง"] ? ` · ${fields["ขนาดห้อง"]}` : ""}</span>
        </>
      ),
    },
    { label: parking ? "ทะเบียนรถ" : "สิ่งของที่เก็บ", value: v(parking ? "ทะเบียนรถ" : "สิ่งของที่เก็บ") },
    {
      label: "ระยะเวลาเช่า",
      value: (
        <>
          {v("วันเริ่มสัญญา")} – {v("วันสิ้นสุดสัญญา")} <span className="font-normal text-muted">({v("ระยะเวลาเช่า")})</span>
        </>
      ),
      wide: true,
    },
    { label: "ค่าเช่า", value: `${v("ค่าเช่า")} บาท/เดือน · ชำระ${v("รอบชำระ")}` },
    { label: "เงินประกัน", value: `${v("เงินประกัน")} บาท` },
    { label: "ค่าเช่าล่วงหน้า", value: `${v("ค่าเช่าล่วงหน้า")} บาท` },
    { label: "ชำระแรกเข้ารวม", value: `${v("ชำระแรกเข้ารวม")} บาท`, highlight: true },
  ];

  return (
    <div className="text-[13px] leading-[1.8] text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* หัวกระดาษ */}
      <header className="relative">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[34px] leading-none font-bold tracking-tight">
              kepz<span className="text-brand-strong">.</span>
            </div>
            <div className="mt-2 text-[12px] leading-snug text-muted">
              <div className="font-semibold text-ink">{business.name}</div>
              {business.address && <div className="whitespace-pre-line">{business.address}</div>}
              {(business.phone || business.email) && (
                <div>{[business.phone && `โทร ${business.phone}`, business.email].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="inline-block rounded-md bg-ink px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-brand">
              {parking ? "PARKING RENTAL AGREEMENT" : "STORAGE RENTAL AGREEMENT"}
            </div>
            <h1 className="mt-2 text-[22px] leading-tight font-bold">{title}</h1>
            <table className="mt-1.5 ml-auto text-left text-[12px] leading-snug">
              <tbody>
                <tr>
                  <td className="pr-3 text-muted">เลขที่สัญญา</td>
                  <td className="font-semibold">{v("เลขที่สัญญา")}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted">วันที่ทำสัญญา</td>
                  <td className="font-semibold">{v("วันที่ทำสัญญา")}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-muted">สาขา</td>
                  <td className="font-semibold">{v("ชื่อสาขา")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full">
          <div className="w-1/4 bg-ink" />
          <div className="flex-1 bg-brand" />
        </div>
      </header>

      {/* สรุปข้อมูลสัญญา */}
      <section className="mt-5 overflow-hidden rounded-lg border border-ink/15 break-inside-avoid">
        <div className="bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white">ข้อมูลสัญญาโดยสรุป</div>
        <dl className="grid grid-cols-2 text-[12.5px] leading-snug">
          {withColumns(summary).map(({ s, left }) => (
            <div
              key={s.label}
              className={clsx(
                "flex gap-3 border-t border-ink/10 px-3.5 py-2",
                s.wide && "col-span-2",
                left && "border-r",
                s.highlight && "bg-brand-soft",
              )}
            >
              <dt className="w-28 shrink-0 text-muted">{s.label}</dt>
              <dd className="min-w-0 font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* เนื้อหาสัญญาตามแม่แบบ */}
      <div className="mt-5">
        {body.map((b, i) => {
          switch (b.kind) {
            case "gap":
              return <div key={i} className="h-2" />;
            case "title":
              return (
                <h2 key={i} className="mt-3 mb-2 text-center text-[16px] font-bold">
                  <Parts parts={b.parts} preview={preview} />
                </h2>
              );
            case "heading":
              return (
                <h3
                  key={i}
                  className="mt-2 mb-1 flex items-center gap-2 rounded-r-md border-l-4 border-brand bg-canvas py-0.5 pl-2.5 text-[13.5px] font-bold break-after-avoid"
                >
                  <Parts parts={b.parts} preview={preview} />
                </h3>
              );
            case "item":
              return (
                <p
                  key={i}
                  className={clsx(
                    plainText(b.parts).startsWith("-") ? "pl-[4.2em] -indent-[1em]" : "pl-[2.8em] -indent-[1.7em]",
                  )}
                >
                  <Parts parts={b.parts} preview={preview} />
                </p>
              );
            default:
              return (
                <p key={i} className="indent-[2.5em]">
                  <Parts parts={b.parts} preview={preview} />
                </p>
              );
          }
        })}
      </div>

      {/* ลงนาม */}
      <section className="mt-10 grid grid-cols-2 gap-6 break-inside-avoid">
        {[
          { role: "ผู้ให้เช่า", name: lessorName },
          { role: "ผู้เช่า", name: tenantName },
        ].map((s) => (
          <div key={s.role} className="rounded-lg border border-ink/15 px-4 pt-3 pb-4 text-center">
            <div className="text-left text-[11px] font-semibold tracking-wide text-muted">{s.role}</div>
            <div className="mx-auto mt-10 w-[85%] border-b border-dotted border-ink" />
            <div className="mt-1.5 font-semibold">({s.name || <span className="inline-block w-40" />})</div>
            <div className="mt-1 text-[12px] text-muted">วันที่ ........../........../..........</div>
          </div>
        ))}
      </section>

      <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-2 text-[10.5px] text-muted">
        <span>
          kepz<span className="text-brand-strong">.</span> · {business.name}
        </span>
        <span>สัญญาเลขที่ {v("เลขที่สัญญา")}</span>
      </div>
    </div>
  );
}
