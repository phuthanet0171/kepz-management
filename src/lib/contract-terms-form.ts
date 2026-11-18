import { isMoney, num, str } from "./form";

/** ตรวจค่ากำหนดชำระ/ค่าปรับ ใช้ทั้งตั้งค่ากลางและค่าเฉพาะสาขา (allowBlank = เว้นว่างได้) */
export function readContractTerms(fd: FormData, allowBlank: boolean) {
  const day = (key: string, label: string) => {
    const v = num(fd, key);
    if (v === null) return allowBlank ? { v: null } : { err: `กรุณากรอก${label}` };
    if (!Number.isInteger(v) || v < 1 || v > 31) return { err: `${label}ต้องเป็นวันที่ 1–31` };
    return { v };
  };
  const fee = (key: string, label: string) => {
    const v = num(fd, key);
    if (v === null) return allowBlank ? { v: null } : { err: `กรุณากรอก${label}` };
    if (!isMoney(v)) return { err: `${label}ไม่ถูกต้อง` };
    return { v };
  };
  const parts = {
    rent_due_day: day("rent_due_day", "วันครบกำหนดชำระ"),
    late_fee_per_day: fee("late_fee_per_day", "ค่าปรับชำระล่าช้า"),
    reclaim_day: day("reclaim_day", "วันที่มีสิทธิ์ยึดพื้นที่คืน"),
    overstay_fee_per_day: fee("overstay_fee_per_day", "ค่าปรับหลังหมดสัญญา"),
  };
  for (const p of Object.values(parts)) if ("err" in p) return { error: p.err as string };
  return {
    patch: {
      lessor_name: str(fd, "lessor_name"),
      bank_account: str(fd, "bank_account"),
      rent_due_day: (parts.rent_due_day as { v: number | null }).v,
      late_fee_per_day: (parts.late_fee_per_day as { v: number | null }).v,
      reclaim_day: (parts.reclaim_day as { v: number | null }).v,
      overstay_fee_per_day: (parts.overstay_fee_per_day as { v: number | null }).v,
    },
  };
}

