import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Supabase client สิทธิ์ผู้ดูแล ใช้เฉพาะฝั่งเซิร์ฟเวอร์ (จัดการบัญชีผู้ใช้)
 * ข้าม RLS ทั้งหมด — ทุกที่ที่เรียกต้องตรวจว่าเป็น Owner ก่อนเสมอ
 */
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isAdminConfigured = Boolean(supabaseUrl && secretKey);

export function createAdminClient() {
  if (!isAdminConfigured) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY");
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
