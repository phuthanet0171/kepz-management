import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchAll } from "@/lib/data";
import {
  BILLING_CYCLE_LABEL,
  CONTRACT_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  todayTH,
  UNIT_STATUS_LABEL,
} from "@/lib/format";
import { agingBucket, getInvoicesInRange, getOutstanding, getPaymentsInRange } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { ContractView, Tenant, UnitView } from "@/lib/types";

type Cell = string | number | boolean | null | undefined;

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

function yearRange(req: NextRequest) {
  const y = req.nextUrl.searchParams.get("year");
  const year = y && /^\d{4}$/.test(y) ? Number(y) : Number(todayTH().slice(0, 4));
  return { year, from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const { kind } = await ctx.params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "ส่งออกข้อมูลได้เฉพาะ Owner" }, { status: 403 });

  let filename: string;
  let rows: Cell[][];

  try {
    switch (kind) {
      case "payments": {
        const { year, from, to } = yearRange(req);
        const ps = await getPaymentsInRange(from, to);
        filename = `kepz-receipts-${year + 543}.csv`;
        rows = [
          ["เลขที่ใบเสร็จ", "วันที่ชำระ", "เลขที่ใบวางบิล", "เลขที่สัญญา", "สาขา", "ห้อง", "ผู้เช่า", "ช่องทาง", "เลขอ้างอิง", "จำนวนเงิน", "สถานะ"],
          ...ps.map((p) => [
            p.receipt_no,
            p.paid_on,
            p.invoices.invoice_no,
            p.invoices.contracts.contract_no,
            p.invoices.contracts.units.branches.name,
            p.invoices.contracts.units.code,
            p.invoices.contracts.tenants.full_name,
            PAYMENT_METHOD_LABEL[p.method],
            p.reference,
            Number(p.amount).toFixed(2),
            p.is_void ? "ยกเลิก" : "ปกติ",
          ]),
        ];
        break;
      }
      case "invoices": {
        const { year, from, to } = yearRange(req);
        const inv = await getInvoicesInRange(from, to);
        filename = `kepz-invoices-${year + 543}.csv`;
        rows = [
          ["เลขที่", "วันที่ออก", "ครบกำหนด", "รอบเริ่ม", "รอบสิ้นสุด", "สาขา", "ห้อง", "ผู้เช่า", "มูลค่าก่อนภาษี", "VAT", "หัก ณ ที่จ่าย", "ยอดชำระสุทธิ", "ชำระแล้ว", "คงค้าง", "สถานะ"],
          ...inv.map((i) => [
            i.invoice_no,
            i.issue_date,
            i.due_date,
            i.period_start,
            i.period_end,
            i.branch_name,
            i.unit_code,
            i.tenant_name,
            Number(i.subtotal).toFixed(2),
            Number(i.vat_amount).toFixed(2),
            Number(i.wht_amount ?? 0).toFixed(2),
            Number(i.total).toFixed(2),
            Number(i.paid_amount).toFixed(2),
            i.status === "void" ? "0.00" : Number(i.outstanding).toFixed(2),
            INVOICE_STATUS_LABEL[i.status],
          ]),
        ];
        break;
      }
      case "outstanding": {
        const inv = await getOutstanding();
        filename = `kepz-outstanding-${todayTH()}.csv`;
        rows = [
          ["เลขที่", "ครบกำหนด", "อายุหนี้", "วันเกินกำหนด", "สาขา", "ห้อง", "ผู้เช่า", "เบอร์โทร", "ยอดรวม", "ชำระแล้ว", "คงค้าง"],
          ...inv.map((i) => [
            i.invoice_no,
            i.due_date,
            agingBucket(i),
            i.days_overdue,
            i.branch_name,
            i.unit_code,
            i.tenant_name,
            i.tenant_phone,
            Number(i.total).toFixed(2),
            Number(i.paid_amount).toFixed(2),
            Number(i.outstanding).toFixed(2),
          ]),
        ];
        break;
      }
      case "contracts": {
        const cs = await fetchAll<ContractView>((a, b) => supabase.from("v_contracts").select("*").order("contract_no").range(a, b));
        filename = `kepz-contracts-${todayTH()}.csv`;
        rows = [
          ["เลขที่สัญญา", "สาขา", "ห้อง", "ประเภท", "ผู้เช่า", "เบอร์โทร", "วันเริ่ม", "วันสิ้นสุด", "รอบชำระ", "ค่าเช่า/เดือน", "เงินประกัน", "เงินประกันคงเหลือ", "ค้างชำระ", "สถานะ", "วันที่ย้ายออก"],
          ...cs.map((c) => [
            c.contract_no,
            c.branch_name,
            c.unit_code,
            c.unit_type_name,
            c.tenant_name,
            c.tenant_phone,
            c.start_date,
            c.end_date,
            BILLING_CYCLE_LABEL[c.billing_cycle],
            Number(c.monthly_rent).toFixed(2),
            Number(c.deposit_amount).toFixed(2),
            Number(c.deposit_balance).toFixed(2),
            Number(c.outstanding).toFixed(2),
            CONTRACT_STATUS_LABEL[c.status],
            c.ended_on,
          ]),
        ];
        break;
      }
      case "tenants": {
        const ts = await fetchAll<Tenant>((a, b) => supabase.from("tenants").select("*").order("full_name").range(a, b));
        filename = `kepz-tenants-${todayTH()}.csv`;
        rows = [
          ["ชื่อ", "ประเภท", "เบอร์โทร", "LINE", "อีเมล", "เลขบัตร/เลขผู้เสียภาษี", "ที่อยู่", "ผู้ติดต่อ", "เบอร์ผู้ติดต่อ", "หมายเหตุ"],
          ...ts.map((t) => [
            t.full_name,
            t.tenant_type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา",
            t.phone,
            t.line_id,
            t.email,
            t.id_number,
            t.address,
            t.emergency_contact_name,
            t.emergency_contact_phone,
            t.note,
          ]),
        ];
        break;
      }
      case "units": {
        const us = await fetchAll<UnitView>((a, b) =>
          supabase.from("v_units").select("*").order("branch_name").order("type_sort").order("code").range(a, b),
        );
        filename = `kepz-units-${todayTH()}.csv`;
        rows = [
          ["สาขา", "รหัส", "ประเภท", "สถานะ", "ราคาตั้งต้น", "ค่าเช่าตามสัญญา", "ผู้เช่า", "เบอร์โทร", "สัญญาสิ้นสุด"],
          ...us.map((u) => [
            u.branch_name,
            u.code,
            u.unit_type_name,
            UNIT_STATUS_LABEL[u.status],
            Number(u.effective_price).toFixed(2),
            u.contract_rent !== null ? Number(u.contract_rent).toFixed(2) : "",
            u.tenant_name,
            u.tenant_phone,
            u.contract_end_date,
          ]),
        ];
        break;
      }
      default:
        return NextResponse.json({ error: "ไม่พบรายงาน" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "ส่งออกข้อมูลไม่สำเร็จ" }, { status: 500 });
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
