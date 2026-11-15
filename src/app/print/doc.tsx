import type { ReactNode } from "react";
import { PrintToolbar } from "./print-toolbar";
import type { Settings } from "@/lib/types";

/** กระดาษ A4 สำหรับเอกสาร แสดงผลบนจอและพิมพ์ได้ */
export function Paper({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintToolbar title={title} />
      <div className="overflow-x-auto px-2 py-4 print:p-0">
        <article className="mx-auto w-[210mm] min-w-[210mm] bg-white p-[14mm] text-[13px] leading-relaxed text-ink shadow-sm print:w-auto print:min-w-0 print:p-0 print:shadow-none">
          {children}
        </article>
      </div>
    </div>
  );
}

export function DocHeader({
  settings,
  title,
  subtitle,
  meta,
}: {
  settings: Settings;
  title: string;
  subtitle?: string;
  meta: { label: string; value: ReactNode }[];
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
      <div className="min-w-0">
        <div className="text-2xl font-bold">
          kepz<span className="text-brand-strong">.</span>
        </div>
        <div className="mt-1 font-semibold">{settings.business_name}</div>
        {settings.business_address && <div className="whitespace-pre-line text-muted">{settings.business_address}</div>}
        <div className="text-muted">
          {[settings.business_phone && `โทร ${settings.business_phone}`, settings.business_email].filter(Boolean).join(" · ")}
        </div>
        {settings.tax_id && <div className="text-muted">เลขประจำตัวผู้เสียภาษี {settings.tax_id}</div>}
      </div>
      <div className="shrink-0 text-right">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
        <table className="mt-2 ml-auto text-left">
          <tbody>
            {meta.map((m) => (
              <tr key={m.label}>
                <td className="pr-3 text-muted">{m.label}</td>
                <td className="font-medium">{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}

export function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-14 grid grid-cols-2 gap-12 text-center break-inside-avoid">
      {[left, right].map((l) => (
        <div key={l}>
          <div className="mx-auto mb-1 w-56 border-b border-dotted border-ink pt-8" />
          <div>{l}</div>
          <div className="mt-1 text-muted">วันที่ ......../......../........</div>
        </div>
      ))}
    </div>
  );
}
