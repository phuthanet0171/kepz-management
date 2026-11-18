import clsx from "clsx";
import type { Block, Inline } from "@/lib/contract-template";
import type { UnitKind } from "@/lib/types";
import { BrandHeader, DocFooter, InfoBox, InfoGrid, SignatureBoxes, WriteLine, type DocBusiness, type InfoRow } from "./print-kit";

export type ContractBusiness = DocBusiness;

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
        // ไม่มีข้อมูล: เว้นเส้นให้เขียนด้วยมือ กว้างพอเขียนได้จริง
        if (!p.v) {
          return (
            <span key={i} className={clsx(preview && "rounded bg-brand-soft")} title={preview ? `{${p.key}} ยังไม่มีข้อมูล` : undefined}>
              {" "}
              <WriteLine width="13em" />{" "}
            </span>
          );
        }
        // ข้อมูลที่ระบบเติมให้: ตัวหนา ขีดเส้นใต้บางๆ ให้ดูเหมือนช่องกรอกที่กรอกแล้ว
        return (
          <span
            key={i}
            className={clsx(
              "border-b border-ink/30 px-0.5 font-semibold",
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
  const titleBlock = titleIdx >= 0 ? blocks[titleIdx] : null;
  const title =
    titleBlock && "parts" in titleBlock
      ? plainText(titleBlock.parts)
      : kind === "parking"
        ? "สัญญาเช่าที่จอดรถ"
        : "สัญญาเช่าห้องเก็บของ";
  const body = blocks.filter((_, i) => i !== titleIdx);
  while (body[0]?.kind === "gap") body.shift();

  const parking = kind === "parking";
  const v = (k: string) => fields[k] || "-";
  const summary: InfoRow[] = [
    { label: "ผู้เช่า", value: v("ชื่อผู้เช่า") },
    { label: "เบอร์โทร", value: v("เบอร์ผู้เช่า") },
    {
      label: parking ? "ช่องจอด" : "ห้องเก็บของ",
      value: (
        <>
          {v("เลขห้อง")}{" "}
          <span className="font-normal text-muted">
            · {v("ประเภทห้อง")}
            {fields["ขนาดห้อง"] ? ` · ${fields["ขนาดห้อง"]}` : ""}
          </span>
        </>
      ),
    },
    {
      label: parking ? "ทะเบียนรถ" : "สิ่งของที่เก็บ",
      value: fields[parking ? "ทะเบียนรถ" : "สิ่งของที่เก็บ"] || <WriteLine width="100%" />,
    },
    {
      label: "ระยะเวลาเช่า",
      value: (
        <>
          {v("วันเริ่มสัญญา")} – {v("วันสิ้นสุดสัญญา")} <span className="font-normal text-muted">({v("ระยะเวลาเช่า")})</span>
        </>
      ),
      wide: true,
    },
    { label: "ค่าเช่า", value: `${v("ค่าเช่า")} บาท/เดือน` },
    { label: "รอบชำระ", value: `${v("รอบชำระ")} ภายในวันที่ ${v("ชำระภายในวันที่")}` },
    { label: "เงินประกัน", value: `${v("เงินประกัน")} บาท` },
    { label: "ค่าเช่าล่วงหน้า", value: `${v("ค่าเช่าล่วงหน้า")} บาท` },
    {
      label: "ชำระแรกเข้ารวม",
      value: (
        <>
          <span className="text-[16px]">{v("ชำระแรกเข้ารวม")} บาท</span>{" "}
          <span className="font-normal text-muted">({v("ชำระแรกเข้ารวมตัวอักษร")})</span>
        </>
      ),
      wide: true,
      highlight: true,
    },
  ];

  return (
    <div className="text-[15px] leading-[1.95] text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <BrandHeader
        business={business}
        badge={parking ? "PARKING RENTAL AGREEMENT" : "STORAGE RENTAL AGREEMENT"}
        title={title}
        meta={[
          { label: "เลขที่สัญญา", value: v("เลขที่สัญญา") },
          { label: "วันที่ทำสัญญา", value: v("วันที่ทำสัญญา") },
          { label: "สาขา", value: v("ชื่อสาขา") },
        ]}
      />

      <InfoBox title="ข้อมูลสัญญาโดยสรุป" className="mt-6">
        <InfoGrid rows={summary} />
      </InfoBox>

      {/* เนื้อหาสัญญาตามแม่แบบ */}
      <div className="mt-6">
        {body.map((b, i) => {
          switch (b.kind) {
            case "gap":
              return <div key={i} className="h-3" />;
            case "title":
              return (
                <h2 key={i} className="mt-4 mb-2 text-center text-[18px] font-bold">
                  <Parts parts={b.parts} preview={preview} />
                </h2>
              );
            case "heading":
              return (
                <h3
                  key={i}
                  className="mt-3 mb-1.5 rounded-r-md border-l-[5px] border-brand bg-canvas py-1 pl-3 text-[16px] font-bold break-after-avoid"
                >
                  <Parts parts={b.parts} preview={preview} />
                </h3>
              );
            case "item":
              return (
                <p
                  key={i}
                  className={clsx(
                    plainText(b.parts).startsWith("-") ? "pl-[4.2em] -indent-[1em]" : "pl-[2.8em] -indent-[1.8em]",
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

      <SignatureBoxes
        items={[
          { role: "ผู้ให้เช่า", name: lessorName },
          { role: "ผู้เช่า", name: tenantName },
        ]}
      />

      <DocFooter business={business} right={`สัญญาเลขที่ ${v("เลขที่สัญญา")}`} />
    </div>
  );
}
