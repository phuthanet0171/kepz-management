/**
 * วันครบกำหนดชำระค่าเช่า: "ชำระภายในวันที่ N ของเดือน" (ตั้งค่า → สัญญาเช่า หรือเฉพาะสาขา)
 * = วันที่ N แรกที่ไม่ก่อนวันเริ่มรอบบิล เช่น N = 5, รอบเริ่ม 1 ธ.ค. → 5 ธ.ค. · รอบเริ่ม 19 ธ.ค. → 5 ม.ค.
 * และไม่ก่อนวันที่ออกบิล (ออกบิลย้อนหลัง = ครบกำหนดวันที่ออก)
 */
export function rentDueDate(periodStart: string, dueDay: number | null | undefined, issueDate: string): string {
  if (!dueDay || dueDay < 1 || dueDay > 31) return periodStart > issueDate ? periodStart : issueDate;
  const [y, m, d] = periodStart.split("-").map(Number);
  const pick = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // วันสุดท้ายของเดือน mm (1–12)
    return { yy, mm, dd: Math.min(dueDay, last) };
  };
  let c = pick(y, m);
  if (c.dd < d) c = m === 12 ? pick(y + 1, 1) : pick(y, m + 1);
  const iso = `${c.yy}-${String(c.mm).padStart(2, "0")}-${String(c.dd).padStart(2, "0")}`;
  return iso > issueDate ? iso : issueDate;
}
