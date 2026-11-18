import clsx from "clsx";
import type { Block, Inline } from "@/lib/contract-template";

const BLANK = "…………………………";

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
            <span key={i} className={clsx(preview && "rounded bg-brand-soft")} title={preview ? `{${p.key}} ยังไม่มีข้อมูล` : undefined}>
              {BLANK}
            </span>
          );
        }
        return (
          <span key={i} className={clsx("font-semibold", p.bold && "font-bold", preview && "rounded bg-brand-soft/70")}>
            {p.v}
          </span>
        );
      })}
    </>
  );
}

export function ContractDocument({
  blocks,
  lessorName,
  tenantName,
  preview,
}: {
  blocks: Block[];
  lessorName: string | null;
  tenantName: string;
  preview?: boolean;
}) {
  return (
    <div className="text-[13.5px] leading-[1.75]">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "gap":
            return <div key={i} className="h-2.5" />;
          case "title":
            return (
              <h1 key={i} className="mb-3 text-center text-lg font-bold">
                <Parts parts={b.parts} preview={preview} />
              </h1>
            );
          case "heading":
            return (
              <h2 key={i} className="mt-1 font-bold break-after-avoid">
                <Parts parts={b.parts} preview={preview} />
              </h2>
            );
          case "item":
            return (
              <p key={i} className="pl-[2.6em] -indent-[1.6em]">
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

      <div className="mt-14 grid grid-cols-2 gap-10 text-center break-inside-avoid">
        {[
          { role: "ผู้ให้เช่า", name: lessorName },
          { role: "ผู้เช่า", name: tenantName },
        ].map((s) => (
          <div key={s.role}>
            <div>
              ลงชื่อ <span className="inline-block w-44 border-b border-dotted border-ink align-bottom" /> {s.role}
            </div>
            <div className="mt-1">({s.name || <span className="inline-block w-40" />})</div>
          </div>
        ))}
      </div>
    </div>
  );
}
