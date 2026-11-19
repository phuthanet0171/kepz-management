"use client";

import { CalendarPlus, LogOut, Pencil, PiggyBank } from "lucide-react";
import { useState } from "react";
import { Alert, Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { addDays, addMonths, money, thDate } from "@/lib/format";
import type { ContractView, DepositTxnType } from "@/lib/types";
import { endContract, recordDeposit, renewContract, updateContractInfo } from "../actions";

export function RenewContractButton({ contract }: { contract: ContractView }) {
  return (
    <Sheet
      title="ต่อสัญญา"
      description={`สัญญาเดิมสิ้นสุด ${thDate(contract.end_date)}`}
      triggerClassName="btn btn-outline"
      trigger={
        <>
          <CalendarPlus className="size-4" /> ต่อสัญญา
        </>
      }
    >
      {(close) => <RenewForm contract={contract} onDone={close} />}
    </Sheet>
  );
}

function RenewForm({ contract, onDone }: { contract: ContractView; onDone: () => void }) {
  const base = addDays(contract.end_date, 1);
  const [end, setEnd] = useState(addDays(addMonths(base, 12), -1));
  return (
    <ActionForm action={renewContract} onSuccess={onDone}>
      <input type="hidden" name="id" value={contract.id} />
      <div className="flex flex-wrap gap-2">
        {[3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setEnd(addDays(addMonths(base, m), -1))}
          >
            +{m < 12 ? `${m} เดือน` : "1 ปี"}
          </button>
        ))}
      </div>
      <Field label="วันสิ้นสุดใหม่" required>
        <input
          name="new_end_date"
          type="date"
          required
          min={base}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="ค่าเช่าต่อเดือน (บาท)" required hint="ค่าเช่าใหม่จะใช้กับใบวางบิลที่ออกหลังจากนี้">
        <input
          name="new_rent"
          type="number"
          inputMode="decimal"
          min={0.01}
          step="0.01"
          required
          defaultValue={contract.monthly_rent}
          className="input tabular"
        />
      </Field>
      <Field label="หมายเหตุ">
        <input name="note" className="input" />
      </Field>
      <SubmitButton className="btn btn-primary w-full">ยืนยันต่อสัญญา</SubmitButton>
    </ActionForm>
  );
}

export function EndContractButton({ contract, today }: { contract: ContractView; today: string }) {
  return (
    <Sheet
      title="สิ้นสุดสัญญา / ย้ายออก"
      triggerClassName="btn btn-danger"
      trigger={
        <>
          <LogOut className="size-4" /> สิ้นสุดสัญญา
        </>
      }
    >
      {(close) => (
        <ActionForm action={endContract} onSuccess={close}>
          <input type="hidden" name="id" value={contract.id} />
          {Number(contract.outstanding) > 0 && (
            <Alert tone="bad">ยังมียอดค้างชำระ {money(contract.outstanding)} บาท ใบวางบิลจะยังคงค้างอยู่หลังสิ้นสุดสัญญา</Alert>
          )}
          {Number(contract.deposit_balance) > 0 && (
            <Alert tone="warn">ยังมีเงินประกันคงเหลือ {money(contract.deposit_balance)} บาท อย่าลืมบันทึกคืนหรือหักเงินประกัน</Alert>
          )}
          <Field label="ประเภท" required>
            <select name="status" className="input" defaultValue="ended">
              <option value="ended">สิ้นสุดสัญญา (ย้ายออกตามปกติ)</option>
              <option value="cancelled">ยกเลิกสัญญา (บอกเลิกก่อนกำหนด / ทำผิดเงื่อนไข)</option>
            </select>
          </Field>
          <Field label="วันที่ย้ายออก" required>
            <input
              name="ended_on"
              type="date"
              required
              min={contract.start_date}
              defaultValue={today < contract.end_date ? today : contract.end_date}
              className="input"
            />
          </Field>
          <Field label="เหตุผล / หมายเหตุ">
            <input name="reason" className="input" />
          </Field>
          <p className="text-xs text-muted">หลังยืนยัน ห้องจะกลับเป็นสถานะว่างและพร้อมทำสัญญาใหม่</p>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90">ยืนยันสิ้นสุดสัญญา</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function DepositButton({ contract, today, label = "บันทึก" }: { contract: ContractView; today: string; label?: string }) {
  const received = Number(contract.deposit_balance);
  const toReceive = Math.max(0, Number(contract.deposit_amount) - received);
  return (
    <Sheet
      title="บันทึกเงินประกัน"
      description={`ตามสัญญา ${money(contract.deposit_amount)} บาท · คงเหลือ ${money(received)} บาท`}
      triggerClassName="btn btn-outline btn-sm"
      trigger={
        <>
          <PiggyBank className="size-3.5" /> {label}
        </>
      }
    >
      {(close) => <DepositForm contract={contract} today={today} toReceive={toReceive} balance={received} onDone={close} />}
    </Sheet>
  );
}

function DepositForm({
  contract,
  today,
  toReceive,
  balance,
  onDone,
}: {
  contract: ContractView;
  today: string;
  toReceive: number;
  balance: number;
  onDone: () => void;
}) {
  const [type, setType] = useState<DepositTxnType>(toReceive > 0 ? "receive" : "refund");
  const max = type === "receive" ? toReceive : balance;
  return (
    <ActionForm action={recordDeposit} onSuccess={onDone}>
      <input type="hidden" name="contract_id" value={contract.id} />
      <Field label="ประเภทรายการ" required>
        <select name="txn_type" value={type} onChange={(e) => setType(e.target.value as DepositTxnType)} className="input">
          <option value="receive" disabled={toReceive <= 0}>
            รับเงินประกัน (ค้างรับ {money(toReceive)})
          </option>
          <option value="refund" disabled={balance <= 0}>
            คืนเงินประกันให้ผู้เช่า
          </option>
          <option value="deduct" disabled={balance <= 0}>
            หักเงินประกัน (ค่าเสียหาย / ค่าเช่าค้าง)
          </option>
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="จำนวนเงิน (บาท)" required hint={`ไม่เกิน ${money(max)} บาท`}>
          <input
            key={type}
            name="amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            max={max}
            step="0.01"
            required
            defaultValue={max || ""}
            className="input tabular"
          />
        </Field>
        <Field label="วันที่" required>
          <input name="txn_date" type="date" required defaultValue={today} className="input" />
        </Field>
      </div>
      {type !== "deduct" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ช่องทาง" required>
            <select name="method" className="input" defaultValue="transfer">
              <option value="transfer">โอนเงิน / พร้อมเพย์</option>
              <option value="credit_card">บัตรเครดิต</option>
            </select>
          </Field>
          <Field label="เลขอ้างอิง">
            <input name="reference" className="input" />
          </Field>
        </div>
      )}
      <Field label={type === "deduct" ? "เหตุผลที่หัก" : "หมายเหตุ"} required={type === "deduct"}>
        <input name="note" required={type === "deduct"} className="input" />
      </Field>
      <SubmitButton className="btn btn-primary w-full">บันทึก</SubmitButton>
    </ActionForm>
  );
}

export type EditUnitOption = { id: string; code: string; branch_name: string; unit_type_name: string; effective_price: number };
export type EditTenantOption = { id: string; full_name: string; phone: string };

export function EditContractInfoButton({
  contract,
  purpose,
  isParking,
  canEditCore,
  units = [],
  tenants = [],
  openBills = [],
}: {
  contract: ContractView;
  purpose: string | null;
  isParking: boolean;
  /** ยังไม่มีการรับชำระ แก้ผู้เช่า ห้อง ยอดเงิน วันที่ได้ */
  canEditCore: boolean;
  units?: EditUnitOption[];
  tenants?: EditTenantOption[];
  /** เลขใบวางบิลที่ยังไม่ชำระ (จะถูกยกเลิกและออกใหม่เมื่อแก้ข้อมูลหลัก) */
  openBills?: string[];
}) {
  return (
    <Sheet
      title="แก้ไขรายละเอียดสัญญา"
      description={`${contract.contract_no} · แก้แล้วสัญญาที่พิมพ์ใหม่จะใช้ข้อมูลล่าสุด`}
      triggerClassName="btn btn-outline"
      trigger={
        <>
          <Pencil className="size-4" /> แก้ไขรายละเอียด
        </>
      }
    >
      {(close) => (
        <EditContractForm
          contract={contract}
          purpose={purpose}
          isParking={isParking}
          canEditCore={canEditCore}
          units={units}
          tenants={tenants}
          openBills={openBills}
          onDone={close}
        />
      )}
    </Sheet>
  );
}

function EditContractForm({
  contract: c,
  purpose,
  isParking,
  canEditCore,
  units,
  tenants,
  openBills,
  onDone,
}: {
  contract: ContractView;
  purpose: string | null;
  isParking: boolean;
  canEditCore: boolean;
  units: EditUnitOption[];
  tenants: EditTenantOption[];
  openBills: string[];
  onDone: () => void;
}) {
  const [unitId, setUnitId] = useState(c.unit_id);
  const [tenantId, setTenantId] = useState(c.tenant_id);
  const [rent, setRent] = useState(String(Number(c.monthly_rent)));
  const [deposit, setDeposit] = useState(String(Number(c.deposit_amount)));
  const [start, setStart] = useState(c.start_date);
  const [end, setEnd] = useState(c.end_date);
  const [cycle, setCycle] = useState<string>(c.billing_cycle);
  const changed =
    unitId !== c.unit_id ||
    tenantId !== c.tenant_id ||
    Number(rent) !== Number(c.monthly_rent) ||
    Number(deposit) !== Number(c.deposit_amount) ||
    start !== c.start_date ||
    end !== c.end_date ||
    cycle !== c.billing_cycle;

  // ห้องปัจจุบัน + ห้องว่าง จัดกลุ่มตามสาขา
  const branches = [...new Set(units.map((u) => u.branch_name))];

  return (
    <ActionForm action={updateContractInfo} onSuccess={onDone} resetOnSuccess={false}>
      <input type="hidden" name="id" value={c.id} />
      {canEditCore ? (
        <>
          <Field label="ผู้เช่า" required>
            <select name="tenant_id" required value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="input">
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} · {t.phone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ห้อง / ที่จอด" required hint="แสดงเฉพาะห้องว่างและห้องปัจจุบัน">
            <select
              name="unit_id"
              required
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                const u = units.find((x) => x.id === e.target.value);
                if (u && e.target.value !== c.unit_id) setRent(String(u.effective_price));
              }}
              className="input"
            >
              {branches.map((b) => (
                <optgroup key={b} label={b}>
                  {units
                    .filter((u) => u.branch_name === b)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} · {u.unit_type_name}
                        {u.id === c.unit_id ? " (ห้องปัจจุบัน)" : ` · ${money(u.effective_price)}/เดือน`}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ค่าเช่าต่อเดือน (บาท)" required>
              <input
                name="monthly_rent"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                required
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                className="input tabular"
              />
            </Field>
            <Field label="เงินประกัน (บาท)" required hint="ไม่เก็บ ใส่ 0">
              <input
                name="deposit_amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                required
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="input tabular"
              />
            </Field>
            <Field label="วันเริ่มสัญญา" required>
              <input
                name="start_date"
                type="date"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="วันสิ้นสุดสัญญา" required>
              <input
                name="end_date"
                type="date"
                required
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="input"
              />
            </Field>
          </div>
          <Field label="รอบการชำระ" required>
            <select name="billing_cycle" required value={cycle} onChange={(e) => setCycle(e.target.value)} className="input">
              <option value="monthly">รายเดือน</option>
              <option value="semiannual">ราย 6 เดือน</option>
              <option value="annual">รายปี</option>
            </select>
          </Field>
          {changed && (
            <Alert tone="warn">
              {openBills.length
                ? `ใบวางบิลที่ยังไม่ชำระ (${openBills.join(", ")}) จะถูกยกเลิก แล้วระบบออกใบวางบิลแรกใหม่ตามข้อมูลที่แก้ให้`
                : "ระบบจะออกใบวางบิลแรกใหม่ตามข้อมูลที่แก้ให้"}
            </Alert>
          )}
        </>
      ) : (
        <Alert tone="info">
          สัญญานี้รับชำระแล้ว แก้ได้เฉพาะข้อความด้านล่าง ถ้าผู้เช่า ห้อง หรือยอดเงินผิด ให้ยกเลิกใบเสร็จที่หน้าใบวางบิลก่อน แล้วกลับมาแก้ที่นี่
        </Alert>
      )}
      <Field label={isParking ? "ทะเบียนรถ" : "เพื่อใช้เก็บ"}>
        <input name="purpose" maxLength={200} defaultValue={purpose ?? ""} className="input" />
      </Field>
      <Field label="หมายเหตุ / เงื่อนไขเพิ่มเติม">
        <textarea name="note" rows={3} defaultValue={c.note ?? ""} className="input min-h-0" />
      </Field>
      <SubmitButton className="btn btn-primary w-full">{changed ? "บันทึกและออกใบวางบิลใหม่" : "บันทึกการแก้ไข"}</SubmitButton>
    </ActionForm>
  );
}
