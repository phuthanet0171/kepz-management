import type { ReactNode } from "react";
import { toneStyle, type DocTone } from "@/components/print-kit";
import { PrintToolbar } from "./print-toolbar";

/** กระดาษ A4 สำหรับเอกสาร แสดงผลบนจอและพิมพ์ได้ */
export function Paper({ title, tone = "contract", children }: { title: string; tone?: DocTone; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintToolbar title={title} />
      <div className="overflow-x-auto px-2 py-4 print:p-0">
        <article style={toneStyle(tone)} className="mx-auto w-[210mm] min-w-[210mm] bg-white p-[14mm] text-[14.5px] leading-relaxed text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:w-auto print:min-w-0 print:px-[14mm] print:py-0 print:shadow-none">
          {/*
            ตอนพิมพ์ตั้งขอบกระดาษเป็น 0 (globals.css) เบราว์เซอร์จึงไม่พิมพ์วันที่ ชื่อหน้า และลิงก์ที่หัว/ท้ายกระดาษ
            แล้วใช้ thead/tfoot ที่ซ้ำทุกหน้าเป็นระยะขอบบน-ล่างแทน
          */}
          <table className="w-full border-collapse">
            <thead className="hidden print:table-header-group">
              <tr>
                <td>
                  <div className="h-[12mm]" />
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-0">{children}</td>
              </tr>
            </tbody>
            <tfoot className="hidden print:table-footer-group">
              <tr>
                <td>
                  <div className="h-[12mm]" />
                </td>
              </tr>
            </tfoot>
          </table>
        </article>
      </div>
    </div>
  );
}
