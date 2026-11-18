type PgError = { message?: string; code?: string; details?: string | null } | null | undefined;

/** แปลงข้อผิดพลาดจาก Supabase / PostgreSQL เป็นข้อความภาษาไทยที่ผู้ใช้เข้าใจ */
export function thaiError(err: PgError, fallback = "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"): string {
  if (!err) return fallback;
  const msg = err.message ?? "";

  // ข้อความที่ฟังก์ชันในฐานข้อมูลส่งมาเป็นภาษาไทยอยู่แล้ว
  if (/[฀-๿]/.test(msg)) return msg;

  if (err.code === "23505") {
    if (msg.includes("branches_name_key")) return "มีสาขาชื่อนี้อยู่แล้ว";
    if (msg.includes("units_branch_code_key")) return "รหัสห้องนี้มีอยู่แล้วในสาขานี้";
    if (msg.includes("contracts_one_active_per_unit")) return "ห้องนี้มีสัญญาที่ใช้งานอยู่แล้ว";
    return "ข้อมูลนี้มีอยู่แล้วในระบบ";
  }
  if (err.code === "23503") {
    return "ลบไม่ได้ เพราะข้อมูลนี้ถูกใช้งานอยู่ (เช่น มีสัญญาหรือประวัติที่อ้างถึง)";
  }
  if (err.code === "23514") return "ข้อมูลไม่ถูกต้องตามเงื่อนไขของระบบ กรุณาตรวจสอบอีกครั้ง";
  if (err.code === "42501" || msg.includes("row-level security")) return "ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบใหม่";
  if (err.code === "PGRST116") return "ไม่พบข้อมูล";
  // คอลัมน์/ฟังก์ชันใหม่ยังไม่มีในฐานข้อมูล = ยังไม่ได้รันไฟล์ SQL ล่าสุดใน Supabase
  if (
    err.code === "PGRST204" ||
    err.code === "PGRST202" ||
    err.code === "42703" ||
    err.code === "42883" ||
    msg.includes("schema cache")
  ) {
    return "ฐานข้อมูลยังไม่ได้อัปเดต กรุณารันไฟล์ SQL ล่าสุด (supabase/migrations) ใน Supabase > SQL Editor แล้วลองใหม่";
  }
  if (msg.includes("Failed to fetch") || msg.includes("fetch failed")) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต";
  }
  if (msg.includes("Invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (msg.includes("Email not confirmed")) return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล";
  if (msg.includes("User is banned")) return "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อเจ้าของกิจการ";

  return fallback;
}
