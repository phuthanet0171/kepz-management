import type { ReactNode } from "react";
import { toneStyle, type DocTone } from "@/components/print-kit";
import { getWatermark } from "@/lib/data";
import type { DocWatermark } from "@/lib/types";
import { PrintToolbar } from "./print-toolbar";

/**
 * ลายน้ำกลางกระดาษ
 * บนจอ: กลางหน้าแรก · ตอนพิมพ์: position fixed เบราว์เซอร์จะวางซ้ำทุกหน้า
 * ใช้ <img> (ไม่ใช่ background-image) จึงพิมพ์ออกเสมอ ไม่ต้องติ๊ก "Background graphics"
 */
function Watermark({ wm }: { wm: DocWatermark }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[297mm] select-none print:fixed print:inset-0 print:h-auto"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={wm.image!}
        alt=""
        className="absolute max-h-[80%] -translate-x-1/2 -translate-y-1/2 object-contain"
        style={{ left: `${wm.pos_x ?? 50}%`, top: `${wm.pos_y ?? 50}%`, width: `${wm.size}%`, opacity: wm.opacity / 100 }}
      />
    </div>
  );
}

/** กระดาษ A4 สำหรับเอกสาร แสดงผลบนจอและพิมพ์ได้ */
export async function Paper({ title, tone = "contract", children }: { title: string; tone?: DocTone; children: ReactNode }) {
  const wm = await getWatermark();
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintToolbar title={title} />
      <div className="overflow-x-auto px-2 py-4 print:p-0">
        <article
          style={toneStyle(tone)}
          className="relative mx-auto w-[210mm] min-w-[210mm] bg-white p-[14mm] text-[14.5px] leading-relaxed text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:w-auto print:min-w-0 print:px-[14mm] print:py-0 print:shadow-none"
        >
          {/*
            ตอนพิมพ์ตั้งขอบกระดาษเป็น 0 (globals.css) เบราว์เซอร์จึงไม่พิมพ์วันที่ ชื่อหน้า และลิงก์ที่หัว/ท้ายกระดาษ
            แล้วใช้ thead/tfoot ที่ซ้ำทุกหน้าเป็นระยะขอบบน-ล่างแทน
          */}
          {wm?.enabled && wm.image && <Watermark wm={wm} />}
          <table className="relative z-[1] w-full border-collapse">
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
