import clsx from "clsx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "@/components/print-kit";
import { requireOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { money, thDate, todayTH } from "@/lib/format";
import { buildReport, parseYear, REPORT_KINDS, type Cell, type ReportColumn } from "@/lib/report-tables";
import { PrintToolbar } from "../../print-toolbar";

const TITLES: Record<string, string> = {
  payments: "รายงานใบเสร็จรับเงิน",
  invoices: "รายงานใบวางบิล",
  outstanding: "รายงานยอดค้างชำระ",
  contracts: "รายงานสัญญาเช่า",
  tenants: "รายชื่อผู้เช่า",
  units: "รายงานห้องและที่จอด",
};

// ชื่อหน้า = ชื่อไฟล์ PDF ตอนกดบันทึก
export async function generateMetadata({ params, searchParams }: PageProps<"/print/report/[kind]">): Promise<Metadata> {
  const { kind } = await params;
  const sp = await searchParams;
  const year = parseYear(typeof sp.year === "string" ? sp.year : null);
  const base = TITLES[kind] ?? "รายงาน";
  return { title: { absolute: `${base} ${["payments", "invoices"].includes(kind) ? `ปี ${year + 543}` : todayTH()}` } };
}

function fmt(c: ReportColumn, v: Cell) {
  if (v === null || v === undefined || v === "") return c.type === "money" ? "" : "-";
  if (c.type === "money") return money(v);
  if (c.type === "date") return thDate(String(v));
  return String(v);
}

export default async function PrintReportPage({ params, searchParams }: PageProps<"/print/report/[kind]">) {
  await requireOwner();
  const { kind } = await params;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) notFound();
  const sp = await searchParams;
  const year = parseYear(typeof sp.year === "string" ? sp.year : null);
  const [report, settings] = await Promise.all([buildReport(kind, year), getSettings()]);
  if (!report) notFound();

  // คอลัมน์ที่ยาว/ไม่จำเป็นบนกระดาษมีเฉพาะใน CSV
  const cols = report.columns.map((c, i) => ({ ...c, i })).filter((c) => c.pdf !== false);
  const isNum = (c: ReportColumn) => c.type === "money" || c.type === "int";

  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      {/* รายงานเป็นตารางกว้าง พิมพ์แนวนอน */}
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } }`}</style>
      <PrintToolbar title={report.title} />
      <div className="overflow-x-auto px-2 py-4 print:p-0">
        <article className="mx-auto w-[297mm] min-w-[297mm] bg-white px-[12mm] py-[10mm] text-[10.5px] leading-snug text-ink shadow-sm [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:w-auto print:min-w-0 print:py-0 print:shadow-none">
          {/* ขอบกระดาษ 0 (ไม่ให้เบราว์เซอร์พิมพ์วันที่/ลิงก์) ใช้ thead/tfoot ซ้ำทุกหน้าเป็นระยะขอบบน-ล่าง */}
          <table className="w-full border-collapse">
            <thead className="hidden print:table-header-group">
              <tr>
                <td>
                  <div className="h-[10mm]" />
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-0">
                  <header className="mb-4 flex items-end justify-between gap-6 border-b-2 border-ink pb-3">
                    <div className="min-w-0">
                      <Brand className="block text-[28px] leading-none" />
                      <div className="mt-1.5 text-[12px] font-semibold">{settings.business_name}</div>
                      {settings.tax_id && <div className="text-[11px] text-muted">เลขประจำตัวผู้เสียภาษี {settings.tax_id}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <h1 className="text-[20px] leading-tight font-bold">{report.title}</h1>
                      <div className="text-[12px] text-ink-2">{report.scope}</div>
                      <div className="text-[11px] text-muted">
                        {report.rows.length.toLocaleString("th-TH")} รายการ · พิมพ์เมื่อ {thDate(todayTH())}
                      </div>
                    </div>
                  </header>

                  {report.rows.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-muted">ไม่มีข้อมูล</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-ink text-white">
                          <th className="px-1.5 py-1.5 text-left font-semibold">#</th>
                          {cols.map((c) => (
                            <th key={c.i} className={clsx("px-1.5 py-1.5 font-semibold", isNum(c) ? "text-right" : "text-left")}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map((r, ri) => (
                          <tr
                            key={ri}
                            className={clsx(
                              "break-inside-avoid border-b border-line",
                              ri % 2 === 1 && "bg-canvas/60",
                              report.voided?.[ri] && "text-muted",
                            )}
                          >
                            <td className="px-1.5 py-1 text-muted">{ri + 1}</td>
                            {cols.map((c) => (
                              <td
                                key={c.i}
                                className={clsx("px-1.5 py-1 align-top", isNum(c) ? "tabular text-right whitespace-nowrap" : "break-words")}
                              >
                                {fmt(c, r[c.i])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {/* แถวรวมอยู่ท้าย tbody (ถ้าเป็น tfoot เบราว์เซอร์จะพิมพ์ซ้ำทุกหน้า) */}
                        {report.totals && (
                          <tr className="break-inside-avoid border-t-2 border-ink bg-brand/40 font-bold">
                            <td className="px-1.5 py-1.5" />
                            {cols.map((c) => (
                              <td key={c.i} className={clsx("px-1.5 py-1.5", isNum(c) && "tabular text-right whitespace-nowrap")}>
                                {c.type === "money" ? money(report.totals![c.i]) : (report.totals![c.i] ?? "")}
                              </td>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                  {report.voided?.some(Boolean) && (
                    <p className="mt-2 text-[10px] text-muted">
                      แถวสีจาง = {kind === "contracts" ? "สัญญาที่สิ้นสุดแล้ว" : "รายการที่ยกเลิกแล้ว (ไม่นับในยอดรวม)"}
                    </p>
                  )}
                </td>
              </tr>
            </tbody>
            <tfoot className="hidden print:table-footer-group">
              <tr>
                <td>
                  <div className="h-[10mm]" />
                </td>
              </tr>
            </tfoot>
          </table>
        </article>
      </div>
    </div>
  );
}
