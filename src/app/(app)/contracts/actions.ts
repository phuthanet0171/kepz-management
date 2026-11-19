"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { thaiError } from "@/lib/errors";
import { bool, isDate, isMoney, num, reqStr, str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { thDate, todayTH } from "@/lib/format";
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
  const depositRaw = num(fd, "deposit_amount");
  if (depositRaw === null) return { error: "กรุณากรอกเงินประกัน (ถ้าไม่เก็บเงินประกัน ใส่ 0)" };
  const deposit = depositRaw;
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

  // สัญญาสร้างแล้ว ขั้นต่อไปถ้าไม่สำเร็จจะไม่ยกเลิกสัญญา แต่แจ้งให้ทำต่อเองในหน้าสัญญา
  const purpose = str(fd, "purpose");
  if (purpose)
    await supabase
      .from("contracts")
      .update({ purpose: purpose.slice(0, 200) })
      .eq("id", id);

  // ออกใบวางบิลแรกให้เสมอ: ค่าเช่างวดแรก + เงินประกัน (ถ้ามี)
  const invoice = await createFirstInvoice(supabase, id as string, unitId, deposit);

  revalidatePath("/", "layout");
  redirect(`/contracts/${id}?created=1${invoice ? `&invoice=${invoice}` : ""}`);
}

/** ออกใบวางบิลแรก: ค่าเช่างวดแรก (ล่วงหน้า) + เงินประกัน คืนผลเป็น ok | partial | fail */
async function createFirstInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
  unitId: string,
  deposit: number,
): Promise<string> {
  const [{ data: periods, error: pErr }, { data: c }, { data: u }] = await Promise.all([
    supabase.rpc("next_billing_period", { p_contract_id: contractId }),
    supabase.from("contracts").select("monthly_rent").eq("id", contractId).single(),
    supabase.from("units").select("code").eq("id", unitId).single(),
  ]);
  const p = (periods as { period_start: string; period_end: string; months: number; is_partial: boolean }[] | null)?.[0];
  if (pErr || !c) return "fail";
  // งวดแรกไม่เต็มรอบ (เช่น สัญญาสั้นกว่ารอบชำระ) ให้ออกบิลค่าเช่าเอง แต่ยังออกบิลเงินประกันให้
  const rentOk = !!p && !p.is_partial;

  const depositItem = {
    item_type: "deposit",
    description: `เงินประกันการเช่า ${u?.code ?? ""}`.trim(),
    quantity: 1,
    unit_price: deposit,
  };
  const items = [
    ...(rentOk
      ? [
          {
            item_type: "rent",
            description: `ค่าเช่า ${u?.code ?? "งวดแรก"} (${thDate(p.period_start)} – ${thDate(p.period_end)})`,
            quantity: p.months,
            unit_price: Number(c.monthly_rent),
          },
        ]
      : []),
    ...(deposit > 0 ? [depositItem] : []),
  ];
  if (!items.length) return p?.is_partial ? "partial" : "fail";

  const today = todayTH();
  const { error } = await supabase.rpc("create_invoice", {
    p_contract_id: contractId,
    p_period_start: rentOk ? p.period_start : null,
    p_period_end: rentOk ? p.period_end : null,
    p_issue_date: today,
    p_due_date: rentOk && p.period_start > today ? p.period_start : today,
    p_items: items,
    p_note: deposit > 0 ? "ค่าเช่าล่วงหน้างวดแรกและเงินประกัน" : "ค่าเช่าล่วงหน้างวดแรก",
  });
  if (error) return "fail";
  return rentOk ? "ok" : "partial";
}

export async function updateContractInfo(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = reqStr(fd, "id");
  const purpose = str(fd, "purpose");
  const supabase = await createClient();

  // ข้อมูลหลัก (ผู้เช่า ห้อง ค่าเช่า เงินประกัน วันที่ รอบชำระ) ส่งมาเฉพาะเมื่อยังแก้ได้ (ยังไม่มีการรับชำระ)
  let reissued = "";
  if (fd.has("unit_id")) {
    const unitId = reqStr(fd, "unit_id");
    const tenantId = reqStr(fd, "tenant_id");
    const start = str(fd, "start_date");
    const end = str(fd, "end_date");
    const cycle = reqStr(fd, "billing_cycle");
    const rent = num(fd, "monthly_rent");
    const deposit = num(fd, "deposit_amount");
    if (!unitId) return { error: "กรุณาเลือกห้อง" };
    if (!tenantId) return { error: "กรุณาเลือกผู้เช่า" };
    if (!isDate(start) || !isDate(end)) return { error: "กรุณาระบุวันเริ่มและวันสิ้นสุดสัญญา" };
    if (end < start) return { error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มสัญญา" };
    if (!CYCLES.includes(cycle)) return { error: "กรุณาเลือกรอบการชำระ" };
    if (!isMoney(rent, { allowZero: false })) return { error: "ค่าเช่าต่อเดือนต้องมากกว่า 0" };
    if (deposit === null) return { error: "กรุณากรอกเงินประกัน (ถ้าไม่เก็บเงินประกัน ใส่ 0)" };
    if (!isMoney(deposit)) return { error: "ยอดเงินประกันไม่ถูกต้อง" };

    const { data: cur } = await supabase
      .from("contracts")
      .select("unit_id, tenant_id, start_date, end_date, billing_cycle, monthly_rent, deposit_amount")
      .eq("id", id)
      .single();
    const changed =
      !cur ||
      cur.unit_id !== unitId ||
      cur.tenant_id !== tenantId ||
      cur.start_date !== start ||
      cur.end_date !== end ||
      cur.billing_cycle !== cycle ||
      Number(cur.monthly_rent) !== rent ||
      Number(cur.deposit_amount) !== deposit;
    if (changed) {
      const { error: coreErr } = await supabase.rpc("update_contract_core", {
        p_contract_id: id,
        p_unit_id: unitId,
        p_tenant_id: tenantId,
        p_start_date: start,
        p_end_date: end,
        p_billing_cycle: cycle,
        p_monthly_rent: rent,
        p_deposit_amount: deposit,
      });
      if (coreErr) {
        if (coreErr.code === "PGRST202" || coreErr.message?.includes("schema cache")) {
          return { error: "การแก้ไขผู้เช่า ห้อง หรือยอดเงิน ต้องรันไฟล์ 0015_edit_contract.sql ใน Supabase ก่อน" };
        }
        return { error: thaiError(coreErr, "แก้ไขสัญญาไม่สำเร็จ") };
      }
      reissued = await createFirstInvoice(supabase, id, unitId, deposit!);
    }
  }

  const { error } = await supabase
    .from("contracts")
    .update({ purpose: purpose ? purpose.slice(0, 200) : null, note: str(fd, "note") })
    .eq("id", id);
  if (error) return { error: thaiError(error, "บันทึกไม่สำเร็จ") };
  revalidatePath("/", "layout");
  if (!reissued) return { ok: true, message: "บันทึกแล้ว" };
  return {
    ok: true,
    message:
      reissued === "ok"
        ? "แก้ไขสัญญาแล้ว ยกเลิกใบวางบิลเดิมและออกใบวางบิลแรกใหม่ตามข้อมูลที่แก้ให้แล้ว"
        : "แก้ไขสัญญาแล้ว แต่ออกใบวางบิลใหม่ไม่สำเร็จ กรุณากด “ออกบิลรอบถัดไป” เพื่อออกเอง",
  };
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
