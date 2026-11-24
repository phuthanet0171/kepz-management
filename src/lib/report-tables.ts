import "server-only";
import { fetchAll } from "./data";
import {
  BILLING_CYCLE_LABEL,
  CONTRACT_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  thDate,
  todayTH,
  UNIT_STATUS_LABEL,
} from "./format";
import { agingBucket, depositByInvoice, depositShares, getInvoicesInRange, getOutstanding, getPaymentsInRange } from "./reports";
import { createClient } from "./supabase/server";
import type { ContractView, Tenant, UnitView } from "./types";

export type Cell = string | number | null | undefined;

/** money = จำนวนเงิน · int = จำนวนเต็ม · date = YYYY-MM-DD · text */
export type ColType = "text" | "money" | "int" | "date";

export type ReportColumn = {
  label: string;
  type?: ColType;
  /** false = มีเฉพาะใน CSV (ข้อมูลยาว/ไม่จำเป็นบนกระดาษ) */
  pdf?: boolean;
};

/** ข้อมูลเอกสารรายงาน ใช้ร่วมกันทั้ง CSV และ PDF ให้ตัวเลขตรงกันเสมอ */
export type ReportTable = {
  title: string;
  /** ช่วงข้อมูล เช่น "ปี พ.ศ. 2569" หรือ "ณ วันที่ ..." */
  scope: string;
  fileBase: string;
  columns: ReportColumn[];
  rows: Cell[][];
  /** แถวรวมท้ายตาราง (เฉพาะคอลัมน์เงิน) */
  totals?: Cell[];
  /** แถวที่ยกเลิกแล้ว (แสดงจางใน PDF) */
  voided?: boolean[];
};

export const REPORT_KINDS = ["payments", "invoices", "outstanding", "contracts", "tenants", "units"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const YEAR_KINDS: ReportKind[] = ["payments", "invoices"];

const col = (label: string, type: ColType = "text", pdf = true): ReportColumn => ({ label, type, pdf });

function sumCols(columns: ReportColumn[], rows: Cell[][], skip?: boolean[]) {
  return columns.map((c, i) =>
    c.type === "money" ? rows.reduce((a, r, ri) => a + (skip?.[ri] ? 0 : Number(r[i] ?? 0)), 0) : i === 0 ? "รวม" : null,
  );
}

export function parseYear(raw: string | null | undefined) {
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : Number(todayTH().slice(0, 4));
}

export async function buildReport(kind: string, year: number): Promise<ReportTable | null> {
  const supabase = await createClient();
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const be = year + 543;
  const today = todayTH();

  switch (kind) {
    case "payments": {
      const ps = await getPaymentsInRange(from, to);
      // แยกเงินประกัน (ต้องคืนผู้เช่า) ออกจากค่าเช่าและรายการอื่น ให้นำไปลงบัญชีได้ตรง
      const share = await depositShares(ps.filter((p) => !p.is_void));
      const columns = [
        col("เลขที่ใบเสร็จ"),
        col("วันที่ชำระ", "date"),
        col("เลขที่ใบวางบิล"),
        col("เลขที่สัญญา", "text", false),
        col("สาขา"),
        col("ห้อง"),
        col("ผู้เช่า"),
        col("ช่องทาง"),
        col("เลขอ้างอิง", "text", false),
        col("ค่าเช่าและอื่นๆ", "money"),
        col("เงินประกัน", "money"),
        col("จำนวนเงิน", "money"),
        col("สถานะ"),
      ];
      const voided = ps.map((p) => p.is_void);
      const rows = ps.map((p) => {
        const dep = p.is_void ? 0 : (share.get(p.id) ?? 0);
        return [
          p.receipt_no,
          p.paid_on,
          p.invoices.invoice_no,
          p.invoices.contracts.contract_no,
          p.invoices.contracts.units.branches.name,
          p.invoices.contracts.units.code,
          p.invoices.contracts.tenants.full_name,
          PAYMENT_METHOD_LABEL[p.method],
          p.reference,
          p.is_void ? 0 : Number(p.amount) - dep,
          dep,
          Number(p.amount),
          p.is_void ? "ยกเลิก" : "ปกติ",
        ];
      });
      return {
        title: "รายงานใบเสร็จรับเงิน",
        scope: `ปี พ.ศ. ${be}`,
        fileBase: `kepz-receipts-${be}`,
        columns,
        rows,
        voided,
        totals: sumCols(columns, rows, voided),
      };
    }
    case "invoices": {
      const inv = await getInvoicesInRange(from, to);
      const depInv = await depositByInvoice(inv.map((i) => i.id));
      const columns = [
        col("เลขที่"),
        col("วันที่ออก", "date"),
        col("ครบกำหนด", "date"),
        col("รอบเริ่ม", "date", false),
        col("รอบสิ้นสุด", "date", false),
        col("สาขา"),
        col("ห้อง"),
        col("ผู้เช่า"),
        col("มูลค่าก่อนภาษี", "money", false),
        col("VAT", "money"),
        col("หัก ณ ที่จ่าย", "money"),
        col("เงินประกันในบิล", "money"),
        col("ยอดสุทธิ", "money"),
        col("ชำระแล้ว", "money"),
        col("คงค้าง", "money"),
        col("สถานะ"),
      ];
      const voided = inv.map((i) => i.status === "void");
      const rows = inv.map((i) => [
        i.invoice_no,
        i.issue_date,
        i.due_date,
        i.period_start,
        i.period_end,
        i.branch_name,
        i.unit_code,
        i.tenant_name,
        Number(i.subtotal),
        Number(i.vat_amount),
        Number(i.wht_amount ?? 0),
        depInv.get(i.id) ?? 0,
        Number(i.total),
        Number(i.paid_amount),
        i.status === "void" ? 0 : Number(i.outstanding),
        INVOICE_STATUS_LABEL[i.status],
      ]);
      return {
        title: "รายงานใบวางบิล",
        scope: `ปี พ.ศ. ${be}`,
        fileBase: `kepz-invoices-${be}`,
        columns,
        rows,
        voided,
        totals: sumCols(columns, rows, voided),
      };
    }
    case "outstanding": {
      const inv = await getOutstanding();
      const columns = [
        col("เลขที่"),
        col("ครบกำหนด", "date"),
        col("อายุหนี้"),
        col("เกินกำหนด (วัน)", "int"),
        col("สาขา"),
        col("ห้อง"),
        col("ผู้เช่า"),
        col("เบอร์โทร"),
        col("ยอดรวม", "money"),
        col("ชำระแล้ว", "money"),
        col("คงค้าง", "money"),
      ];
      const rows = inv.map((i) => [
        i.invoice_no,
        i.due_date,
        agingBucket(i),
        i.days_overdue,
        i.branch_name,
        i.unit_code,
        i.tenant_name,
        i.tenant_phone,
        Number(i.total),
        Number(i.paid_amount),
        Number(i.outstanding),
      ]);
      return {
        title: "รายงานยอดค้างชำระ",
        scope: `ณ วันที่ ${thDate(today)}`,
        fileBase: `kepz-outstanding-${today}`,
        columns,
        rows,
        totals: sumCols(columns, rows),
      };
    }
    case "contracts": {
      const cs = await fetchAll<ContractView>((a, b) => supabase.from("v_contracts").select("*").order("contract_no").range(a, b));
      const columns = [
        col("เลขที่สัญญา"),
        col("สาขา"),
        col("ห้อง"),
        col("ประเภท", "text", false),
        col("ผู้เช่า"),
        col("เบอร์โทร"),
        col("วันเริ่ม", "date"),
        col("วันสิ้นสุด", "date"),
        col("รอบชำระ"),
        col("ค่าเช่า/เดือน", "money"),
        col("เงินประกัน", "money"),
        col("เงินประกันคงเหลือ", "money"),
        col("ค้างชำระ", "money"),
        col("สถานะ"),
        col("วันที่ย้ายออก", "date", false),
      ];
      const rows = cs.map((c) => [
        c.contract_no,
        c.branch_name,
        c.unit_code,
        c.unit_type_name,
        c.tenant_name,
        c.tenant_phone,
        c.start_date,
        c.end_date,
        BILLING_CYCLE_LABEL[c.billing_cycle],
        Number(c.monthly_rent),
        Number(c.deposit_amount),
        Number(c.deposit_balance),
        Number(c.outstanding),
        CONTRACT_STATUS_LABEL[c.status],
        c.ended_on,
      ]);
      return {
        title: "รายงานสัญญาเช่า",
        scope: `ณ วันที่ ${thDate(today)}`,
        fileBase: `kepz-contracts-${today}`,
        columns,
        rows,
        voided: cs.map((c) => c.status !== "active"),
      };
    }
    case "tenants": {
      const ts = await fetchAll<Tenant>((a, b) => supabase.from("tenants").select("*").order("full_name").range(a, b));
      const columns = [
        col("ชื่อ"),
        col("ประเภท"),
        col("เบอร์โทร"),
        col("LINE"),
        col("อีเมล"),
        col("เลขบัตร/เลขผู้เสียภาษี"),
        col("ที่อยู่"),
        col("ผู้ติดต่อ", "text", false),
        col("เบอร์ผู้ติดต่อ", "text", false),
        col("หมายเหตุ", "text", false),
      ];
      const rows = ts.map((t) => [
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
      ]);
      return { title: "รายชื่อผู้เช่า", scope: `ณ วันที่ ${thDate(today)}`, fileBase: `kepz-tenants-${today}`, columns, rows };
    }
    case "units": {
      const us = await fetchAll<UnitView>((a, b) =>
        supabase.from("v_units").select("*").order("branch_name").order("type_sort").order("code").range(a, b),
      );
      const columns = [
        col("สาขา"),
        col("รหัส"),
        col("ประเภท"),
        col("สถานะ"),
        col("ราคาตั้งต้น", "money"),
        col("ค่าเช่าตามสัญญา", "money"),
        col("ผู้เช่า"),
        col("เบอร์โทร"),
        col("สัญญาสิ้นสุด", "date"),
      ];
      const rows = us.map((u) => [
        u.branch_name,
        u.code,
        u.unit_type_name,
        UNIT_STATUS_LABEL[u.status],
        Number(u.effective_price),
        u.contract_rent !== null ? Number(u.contract_rent) : null,
        u.tenant_name,
        u.tenant_phone,
        u.contract_end_date,
      ]);
      return {
        title: "รายงานห้องและที่จอด",
        scope: `ณ วันที่ ${thDate(today)}`,
        fileBase: `kepz-units-${today}`,
        columns,
        rows,
        totals: sumCols(columns, rows),
      };
    }
    default:
      return null;
  }
}
