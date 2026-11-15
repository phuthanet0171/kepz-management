/** อ่านค่าข้อความจาก FormData (ตัดช่องว่าง, ค่าว่างเป็น null) */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function reqStr(fd: FormData, key: string): string {
  return str(fd, key) ?? "";
}

/** อ่านตัวเลข (รองรับเครื่องหมายจุลภาค) คืนค่า null ถ้าไม่ได้กรอก หรือ NaN ถ้ารูปแบบผิด */
export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  return Number(v.replace(/,/g, ""));
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function isDate(v: string | null): v is string {
  return v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export function isMoney(n: number | null, { allowZero = true } = {}): n is number {
  return n !== null && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}
