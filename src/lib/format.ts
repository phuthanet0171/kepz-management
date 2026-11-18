import type {
  BillingCycle,
  ContractStatus,
  DepositTxnType,
  InvoiceStatus,
  ItemType,
  PaymentMethod,
  UnitStatus,
} from "./types";

const moneyFmt = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShortFmt = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

/** 1,234.50 */
export function money(n: number | string | null | undefined) {
  return moneyFmt.format(Number(n ?? 0));
}

/** ฿1,235 */
export function baht(n: number | string | null | undefined) {
  return `฿${moneyShortFmt.format(Number(n ?? 0))}`;
}

function parseDate(d: string) {
  // วันที่จากฐานข้อมูลเป็น YYYY-MM-DD ให้ถือเป็นวันที่ตามปฏิทิน ไม่แปลงเขตเวลา
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

const dateFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dateLongFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short", year: "2-digit", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/** 15 พ.ย. 2569 */
export function thDate(d: string | null | undefined) {
  if (!d) return "-";
  return dateFmt.format(parseDate(d));
}

/** 15 พฤศจิกายน 2569 */
export function thDateLong(d: string | null | undefined) {
  if (!d) return "-";
  return dateLongFmt.format(parseDate(d));
}

/** พ.ย. 69 จาก "2026-11" */
export function thMonth(ym: string) {
  return monthFmt.format(parseDate(`${ym}-01`));
}

export function thDateTime(ts: string | null | undefined) {
  if (!ts) return "-";
  return dateTimeFmt.format(new Date(ts));
}

/** วันนี้ตามเวลาประเทศไทย รูปแบบ YYYY-MM-DD */
export function todayTH() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** วันที่ (YYYY-MM-DD) ตามเวลาประเทศไทยของ timestamp */
export function dateOfTH(ts: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(ts));
}

export function addDays(d: string, days: number) {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** บวกเดือนแบบเดียวกับ PostgreSQL (ถ้าวันเกินสิ้นเดือนให้ใช้วันสุดท้ายของเดือน) */
export function addMonths(d: string, months: number) {
  const dt = parseDate(d);
  const day = dt.getUTCDate();
  const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "รายเดือน",
  semiannual: "ราย 6 เดือน",
  annual: "รายปี",
};

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  available: "ว่าง",
  occupied: "มีผู้เช่า",
  maintenance: "ปิดปรับปรุง",
  inactive: "ปิดใช้งาน",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  active: "ใช้งานอยู่",
  ended: "สิ้นสุดแล้ว",
  cancelled: "ยกเลิก",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  unpaid: "รอชำระ",
  partial: "ชำระบางส่วน",
  paid: "ชำระครบ",
  void: "ยกเลิก",
};

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  rent: "ค่าเช่า",
  late_fee: "ค่าปรับ",
  other: "ค่าใช้จ่ายอื่น",
  discount: "ส่วนลด",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "โอนเงิน / พร้อมเพย์",
  credit_card: "บัตรเครดิต",
};

export const DEPOSIT_TXN_LABEL: Record<DepositTxnType, string> = {
  receive: "รับเงินประกัน",
  refund: "คืนเงินประกัน",
  deduct: "หักเงินประกัน",
};
