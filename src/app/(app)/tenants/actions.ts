"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function readTenant(fd: FormData) {
  return {
    tenant_type: str(fd, "tenant_type") === "company" ? "company" : "individual",
    full_name: reqStr(fd, "full_name"),
    phone: reqStr(fd, "phone"),
    email: str(fd, "email"),
    line_id: str(fd, "line_id"),
    id_number: str(fd, "id_number"),
    address: str(fd, "address"),
    emergency_contact_name: str(fd, "emergency_contact_name"),
    emergency_contact_phone: str(fd, "emergency_contact_phone"),
    note: str(fd, "note"),
  };
}

function validate(t: ReturnType<typeof readTenant>): string | null {
  if (!t.full_name) return t.tenant_type === "company" ? "กรุณากรอกชื่อบริษัท" : "กรุณากรอกชื่อ-นามสกุล";
  if (!t.phone) return "กรุณากรอกเบอร์โทร";
  if (!/^[0-9+\-\s()]{6,20}$/.test(t.phone)) return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  if (t.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (t.id_number && !/^\d{13}$/.test(t.id_number.replace(/[\s-]/g, ""))) {
    return "เลขบัตรประชาชน / เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
  }
  return null;
}

export async function createTenant(_: ActionState, fd: FormData): Promise<ActionState> {
  const t = readTenant(fd);
  const err = validate(t);
  if (err) return { error: err };
  if (t.id_number) t.id_number = t.id_number.replace(/[\s-]/g, "");

  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").insert(t).select("id").single();
  if (error) return { error: thaiError(error, "บันทึกผู้เช่าไม่สำเร็จ") };

  revalidatePath("/", "layout");
  const returnTo = str(fd, "return_to");
  if (returnTo?.startsWith("/contracts/new")) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}tenant=${data.id}`);
  }
  redirect(`/tenants/${data.id}`);
}

export async function updateTenant(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const t = readTenant(fd);
  const err = validate(t);
  if (err) return { error: err };
  if (t.id_number) t.id_number = t.id_number.replace(/[\s-]/g, "");

  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update(t).eq("id", id);
  if (error) return { error: thaiError(error, "บันทึกข้อมูลผู้เช่าไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}
