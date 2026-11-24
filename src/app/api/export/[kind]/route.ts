import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildReport, parseYear, type Cell, type ReportColumn } from "@/lib/report-tables";

function csv(rows: Cell[][]) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // กันสูตร Excel จากข้อมูลที่ผู้ใช้กรอก (CSV injection)
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** CSV: เงินเป็นทศนิยม 2 ตำแหน่ง วันที่เป็น YYYY-MM-DD ให้ Excel คำนวณ/เรียงได้ */
function csvCell(c: ReportColumn, v: Cell): Cell {
  if (c.type === "money" && v !== null && v !== undefined && v !== "") return Number(v).toFixed(2);
  return v;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const { kind } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "ส่งออกข้อมูลได้เฉพาะ Owner" }, { status: 403 });

  let body: string;
  let filename: string;
  try {
    const report = await buildReport(kind, parseYear(req.nextUrl.searchParams.get("year")));
    if (!report) return NextResponse.json({ error: "ไม่พบรายงาน" }, { status: 404 });
    const { columns, rows, totals } = report;
    body = csv([
      columns.map((c) => c.label),
      ...rows.map((r) => r.map((v, i) => csvCell(columns[i], v))),
      ...(totals ? [totals.map((v, i) => csvCell(columns[i], v))] : []),
    ]);
    filename = `${report.fileBase}.csv`;
  } catch {
    return NextResponse.json({ error: "ส่งออกข้อมูลไม่สำเร็จ" }, { status: 500 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
