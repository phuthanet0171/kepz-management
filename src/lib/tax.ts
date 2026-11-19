/** ภาษีในใบวางบิล: VAT 7% และ/หรือ หัก ณ ที่จ่าย 5% (ต้องตรงกับ apply_invoice_tax ใน 0008) */
export const VAT_RATE = 7;
export const WHT_RATE = 5;

export type TaxChoice = { vat: boolean; inclusive: boolean; wht: boolean };

export type TaxBreakdown = {
  /** มูลค่าก่อนภาษี */
  subtotal: number;
  vat: number;
  /** มูลค่ารวม VAT (ก่อนหัก ณ ที่จ่าย) */
  gross: number;
  wht: number;
  /** เงินประกัน (ไม่คิดภาษี) */
  deposit: number;
  /** ยอดที่ลูกค้าต้องโอนจริง */
  total: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** sum = ยอดรายการที่คิดภาษี (ไม่รวมเงินประกัน) · deposit = เงินประกัน บวกท้ายโดยไม่คิดภาษี */
export function computeTax(sum: number, t: TaxChoice, vatRate = VAT_RATE, deposit = 0): TaxBreakdown {
  let subtotal = sum;
  let vat = 0;
  if (t.vat) {
    if (t.inclusive) {
      vat = r2((sum * vatRate) / (100 + vatRate));
      subtotal = r2(sum - vat);
    } else {
      vat = r2((sum * vatRate) / 100);
    }
  }
  const wht = t.wht ? r2((subtotal * WHT_RATE) / 100) : 0;
  const gross = r2(subtotal + vat);
  return { subtotal, vat, gross, wht, deposit, total: r2(gross - wht + deposit) };
}

export function taxLabel(inv: { vat_rate: number; wht_rate?: number | null }) {
  const parts: string[] = [];
  if (Number(inv.vat_rate) > 0) parts.push(`VAT ${Number(inv.vat_rate)}%`);
  if (Number(inv.wht_rate ?? 0) > 0) parts.push(`หัก ณ ที่จ่าย ${Number(inv.wht_rate)}%`);
  return parts.length ? parts.join(" · ") : "ไม่มีภาษี";
}
