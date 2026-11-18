import type { ReactNode } from "react";
import { PrintToolbar } from "./print-toolbar";

/** กระดาษ A4 สำหรับเอกสาร แสดงผลบนจอและพิมพ์ได้ */
export function Paper({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintToolbar title={title} />
      <div className="overflow-x-auto px-2 py-4 print:p-0">
        <article className="mx-auto w-[210mm] min-w-[210mm] bg-white p-[14mm] text-[14.5px] leading-relaxed text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:w-auto print:min-w-0 print:p-0 print:shadow-none">
          {children}
        </article>
      </div>
    </div>
  );
}
