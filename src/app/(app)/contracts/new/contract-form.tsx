"use client";

import clsx from "clsx";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { addDays, addMonths, baht, BILLING_CYCLE_LABEL, BILLING_CYCLE_MONTHS, money, thDate } from "@/lib/format";
import type { BillingCycle } from "@/lib/types";
import { createContract } from "../actions";

export type UnitOption = {
  id: string;
  code: string;
  branch_id: string;
  branch_name: string;
  unit_type_name: string;
  kind: "storage" | "parking";
  effective_price: number;
};
export type TenantOption = { id: string; full_name: string; phone: string };

const DURATIONS = [1, 3, 6, 12, 24];

export function ContractForm({
  units,
  tenants,
  branches,
  defaultUnitId,
  defaultTenantId,
  today,
}: {
  units: UnitOption[];
  tenants: TenantOption[];
  branches: { id: string; name: string }[];
  defaultUnitId: string | null;
  defaultTenantId: string | null;
  today: string;
}) {
  const defaultUnit = units.find((u) => u.id === defaultUnitId);
  const [branchId, setBranchId] = useState(defaultUnit?.branch_id ?? branches[0]?.id ?? "");
  const [unitId, setUnitId] = useState(defaultUnit?.id ?? "");
  const [tenantId, setTenantId] = useState(defaultTenantId ?? "");
  const [tenantFilter, setTenantFilter] = useState("");
  const [start, setStart] = useState(today);
  const [duration, setDuration] = useState<number | "custom">(12);
  const [customEnd, setCustomEnd] = useState(addDays(addMonths(today, 12), -1));
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [rent, setRent] = useState(defaultUnit ? String(defaultUnit.effective_price) : "");
  const [deposit, setDeposit] = useState("");
  const [depositReceived, setDepositReceived] = useState(false);
  const [firstInvoice, setFirstInvoice] = useState(true);

  const branchUnits = units.filter((u) => u.branch_id === branchId);
  const unit = units.find((u) => u.id === unitId);
  const end = duration === "custom" ? customEnd : start ? addDays(addMonths(start, duration), -1) : "";

  const filteredTenants = useMemo(() => {
    const q = tenantFilter.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.full_name.toLowerCase().includes(q) || t.phone.includes(q) || t.id === tenantId);
  }, [tenants, tenantFilter, tenantId]);

  const rentNum = Number(rent) || 0;
  const firstPeriodEnd = start ? addDays(addMonths(start, BILLING_CYCLE_MONTHS[cycle]), -1) : "";
  const firstBillEnd = end && firstPeriodEnd > end ? end : firstPeriodEnd;
  const returnTo = `/contracts/new${unitId ? `?unit=${unitId}` : ""}`;

  return (
    <ActionForm action={createContract} className="space-y-5">
      <Card>
        <CardHeader title="1. ห้องที่เช่า" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {branches.length > 1 && (
            <Field label="สาขา">
              <select
                className="input"
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setUnitId("");
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="ห้อง / ที่จอดที่ว่าง" required hint={branchUnits.length === 0 ? "สาขานี้ไม่มีห้องว่าง" : undefined}>
            <select
              name="unit_id"
              required
              className="input"
              value={unitId}
              onChange={(e) => {
                setUnitId(e.target.value);
                const u = units.find((x) => x.id === e.target.value);
                if (u) setRent(String(u.effective_price));
              }}
            >
              <option value="" disabled>
                เลือกห้อง
              </option>
              {branchUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.unit_type_name} · {baht(u.effective_price)}/เดือน
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={unit?.kind === "parking" ? "ทะเบียนรถ" : "เพื่อใช้เก็บ"}
            className="sm:col-span-2"
            hint="พิมพ์ลงในสัญญา เว้นว่างได้ (จะเว้นจุดไว้ให้เขียนด้วยมือ)"
          >
            <input
              name="purpose"
              maxLength={200}
              placeholder={unit?.kind === "parking" ? "เช่น กข 1234 กรุงเทพมหานคร" : "เช่น เฟอร์นิเจอร์ เอกสาร สินค้า"}
              className="input"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="2. ผู้เช่า"
          action={
            <Link href={`/tenants/new?return=${encodeURIComponent(returnTo)}`} className="btn btn-outline btn-sm">
              <UserPlus className="size-3.5" /> ผู้เช่าใหม่
            </Link>
          }
        />
        <div className="space-y-3 p-4 sm:p-5">
          {tenants.length > 8 && (
            <input
              type="search"
              placeholder="พิมพ์ชื่อหรือเบอร์โทรเพื่อค้นหา"
              className="input"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
            />
          )}
          <Field label="เลือกผู้เช่า" required>
            <select name="tenant_id" required className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="" disabled>
                {tenants.length === 0 ? "ยังไม่มีผู้เช่า กด “ผู้เช่าใหม่”" : "เลือกผู้เช่า"}
              </option>
              {filteredTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} · {t.phone}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="3. ระยะสัญญาและรอบชำระ" />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="วันเริ่มสัญญา" required>
              <input
                name="start_date"
                type="date"
                required
                className="input"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="วันสิ้นสุดสัญญา" required>
              {duration === "custom" ? (
                <input
                  name="end_date"
                  type="date"
                  required
                  min={start}
                  className="input"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              ) : (
                <>
                  <input type="hidden" name="end_date" value={end} />
                  <div className="input bg-canvas">{end ? thDate(end) : "-"}</div>
                </>
              )}
            </Field>
          </div>
          <div>
            <span className="label">ระยะเวลา</span>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={clsx("btn btn-sm", duration === d ? "btn-primary" : "btn-outline")}
                >
                  {d < 12 ? `${d} เดือน` : `${d / 12} ปี`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomEnd(end || today);
                  setDuration("custom");
                }}
                className={clsx("btn btn-sm", duration === "custom" ? "btn-primary" : "btn-outline")}
              >
                กำหนดเอง
              </button>
            </div>
          </div>
          <div>
            <span className="label">รอบการชำระ</span>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BILLING_CYCLE_LABEL) as BillingCycle[]).map((c) => (
                <label
                  key={c}
                  className={clsx(
                    "cursor-pointer rounded-xl border-2 px-2 py-2.5 text-center transition",
                    cycle === c ? "border-ink bg-brand-soft" : "border-line hover:border-ink/30",
                  )}
                >
                  <input
                    type="radio"
                    name="billing_cycle"
                    value={c}
                    checked={cycle === c}
                    onChange={() => setCycle(c)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold">{BILLING_CYCLE_LABEL[c]}</span>
                  {rentNum > 0 && (
                    <span className="tabular block text-xs text-muted">
                      {money(rentNum * BILLING_CYCLE_MONTHS[c])} บาท/รอบ
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="4. ค่าเช่าและเงินประกัน" />
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ค่าเช่าต่อเดือน (บาท)"
              required
              hint={unit ? `ราคาตั้งต้นของห้อง ${baht(unit.effective_price)} ปรับเฉพาะสัญญานี้ได้` : undefined}
            >
              <input
                name="monthly_rent"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                required
                className="input tabular"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
              />
            </Field>
            <Field label="เงินประกัน (บาท)" hint="ใส่ 0 หากไม่เก็บเงินประกัน">
              <input
                name="deposit_amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0"
                className="input tabular"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </Field>
          </div>

          {Number(deposit) > 0 && (
            <div className="rounded-xl border border-line p-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="deposit_received"
                  checked={depositReceived}
                  onChange={(e) => setDepositReceived(e.target.checked)}
                  className="size-5 accent-ink"
                />
                <span className="text-sm font-medium">ได้รับเงินประกันแล้ว</span>
              </label>
              {depositReceived && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="วันที่รับ" required>
                    <input name="deposit_received_on" type="date" defaultValue={today} required className="input" />
                  </Field>
                  <Field label="ช่องทาง" required>
                    <select name="deposit_method" required className="input" defaultValue="transfer">
                      <option value="transfer">โอนเงิน / พร้อมเพย์</option>
                      <option value="credit_card">บัตรเครดิต</option>
                    </select>
                  </Field>
                  <Field label="เลขอ้างอิง">
                    <input name="deposit_reference" className="input" />
                  </Field>
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input
              type="checkbox"
              name="first_invoice"
              checked={firstInvoice}
              onChange={(e) => setFirstInvoice(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-ink"
            />
            <span>
              <span className="block text-sm font-medium">ออกใบวางบิลค่าเช่างวดแรกทันที</span>
              <span className="block text-xs text-muted">
                {rentNum > 0 && start && firstBillEnd
                  ? `ค่าเช่า ${thDate(start)} – ${thDate(firstBillEnd)} · ${money(rentNum * BILLING_CYCLE_MONTHS[cycle])} บาท (= ค่าเช่าล่วงหน้าในสัญญา) เงินประกันบันทึกแยกด้านบน`
                  : "ค่าเช่าล่วงหน้างวดแรกตามรอบชำระ เงินประกันบันทึกแยกด้านบน"}
              </span>
            </span>
          </label>

          <Field label="หมายเหตุ / เงื่อนไขเพิ่มเติม">
            <textarea name="note" rows={2} className="input min-h-0" />
          </Field>
        </div>
      </Card>

      {unit && end && rentNum > 0 && (
        <Card className="border-ink bg-ink p-4 text-white sm:p-5">
          <div className="text-sm text-white/60">สรุปสัญญา</div>
          <div className="mt-1 text-lg font-semibold">
            {unit.code} · {unit.branch_name}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-white/60">ระยะสัญญา</div>
              <div>
                {thDate(start)} – {thDate(end)}
              </div>
            </div>
            <div>
              <div className="text-white/60">ค่าเช่า</div>
              <div className="tabular">{money(rentNum)} บาท/เดือน</div>
            </div>
            <div>
              <div className="text-white/60">บิลแรก</div>
              <div>
                {thDate(start)} – {thDate(firstBillEnd)}
              </div>
            </div>
            <div>
              <div className="text-white/60">เงินประกัน</div>
              <div className="tabular">{money(Number(deposit) || 0)} บาท</div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <SubmitButton className="btn btn-primary w-full sm:w-auto" pendingText="กำลังสร้างสัญญา…">
          สร้างสัญญาเช่า
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
