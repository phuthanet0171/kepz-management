"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { bool, isDate, isMoney, num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const CYCLES = ["monthly", "semiannual", "annual"];
const METHODS = ["transfer", "credit_card"];

export async function createContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const unitId = reqStr(fd, "unit_id");
  const tenantId = reqStr(fd, "tenant_id");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const cycle = reqStr(fd, "billing_cycle");
  const rent = num(fd, "monthly_rent");
  const deposit = num(fd, "deposit_amount") ?? 0;
  const depositReceived = bool(fd, "deposit_received");
  const depositDate = str(fd, "deposit_received_on");
  const depositMethod = str(fd, "deposit_method");

  if (!unitId) return { error: "กรุณาเลือกห้อง" };
  if (!tenantId) return { error: "กรุณาเลือกผู้เช่า" };
  if (!isDate(start) || !isDate(end)) return { error: "กรุณาระบุวันเริ่มและวันสิ้นสุดสัญญา" };
  if (end < start) return { error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา" };
  if (!CYCLES.includes(cycle)) return { error: "กรุณาเลือกรอบการชำระ" };
  if (!isMoney(rent, { allowZero: false })) return { error: "ค่าเช่าต่อเดือนต้องมากกว่า 0" };
  if (!isMoney(deposit)) return { error: "ยอดเงินประกันไม่ถูกต้อง" };
  if (depositReceived && deposit > 0) {
    if (!isDate(depositDate)) return { error: "กรุณาระบุวันที่รับเงินประกัน" };
    if (!depositMethod || !METHODS.includes(depositMethod)) return { error: "กรุณาเลือกช่องทางรับเงินประกัน" };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_contract", {
    p_unit_id: unitId,
    p_tenant_id: tenantId,
    p_start_date: start,
    p_end_date: end,
    p_billing_cycle: cycle,
    p_monthly_rent: rent,
    p_deposit_amount: deposit,
    p_note: str(fd, "note"),
    p_deposit_received_on: depositReceived && deposit > 0 ? depositDate : null,
    p_deposit_method: depositReceived && deposit > 0 ? depositMethod : null,
    p_deposit_reference: str(fd, "deposit_reference"),
  });
  if (error) return { error: thaiError(error, "สร้างสัญญาไม่สำเร็จ") };

  revalidatePath("/", "layout");
  redirect(`/contracts/${id}?created=1`);
}

export async function renewContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const newEnd = str(fd, "new_end_date");
  const rent = num(fd, "new_rent");
  if (!isDate(newEnd)) return { error: "กรุณาระบุวันสิ้นสุดใหม่" };
  if (!isMoney(rent, { allowZero: false })) return { error: "ค่าเช่าต่อเดือนต้องมากกว่า 0" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_contract", {
    p_contract_id: id,
    p_new_end_date: newEnd,
    p_new_rent: rent,
    p_note: str(fd, "note"),
  });
  if (error) return { error: thaiError(error, "ต่อสัญญาไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function endContract(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const status = reqStr(fd, "status");
  const endedOn = str(fd, "ended_on");
  if (!["ended", "cancelled"].includes(status)) return { error: "กรุณาเลือกประเภทการสิ้นสุด" };
  if (!isDate(endedOn)) return { error: "กรุณาระบุวันที่ย้ายออก" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_contract", {
    p_contract_id: id,
    p_status: status,
    p_ended_on: endedOn,
    p_reason: str(fd, "reason"),
  });
  if (error) return { error: thaiError(error, "สิ้นสุดสัญญาไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recordDeposit(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "contract_id");
  const type = reqStr(fd, "txn_type");
  const amount = num(fd, "amount");
  const date = str(fd, "txn_date");
  const method = str(fd, "method");

  if (!["receive", "refund", "deduct"].includes(type)) return { error: "กรุณาเลือกประเภทรายการ" };
  if (!isMoney(amount, { allowZero: false })) return { error: "จำนวนเงินต้องมากกว่า 0" };
  if (!isDate(date)) return { error: "กรุณาระบุวันที่" };
  if (type !== "deduct" && (!method || !METHODS.includes(method))) return { error: "กรุณาเลือกช่องทาง" };
  if (type === "deduct" && !str(fd, "note")) return { error: "กรุณาระบุเหตุผลที่หักเงินประกัน" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_deposit", {
    p_contract_id: id,
    p_txn_type: type,
    p_amount: amount,
    p_txn_date: date,
    p_method: type === "deduct" ? null : method,
    p_reference: str(fd, "reference"),
    p_note: str(fd, "note"),
  });
  if (error) return { error: thaiError(error, "บันทึกเงินประกันไม่สำเร็จ") };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateContractNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").update({ note: str(fd, "note") }).eq("id", id);
  if (error) return { error: thaiError(error, "บันทึกหมายเหตุไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: true };
}
