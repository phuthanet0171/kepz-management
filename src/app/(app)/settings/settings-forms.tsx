"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import type { Settings, UnitType } from "@/lib/types";
import { saveAlerts, saveBusiness, saveContractSettings, saveDocuments, saveUnitTypes, saveVat } from "./actions";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export function BusinessForm({ s }: { s: Settings }) {
  return (
    <Section title="ข้อมูลกิจการ" description="แสดงบนหัวใบแจ้งหนี้ ใบเสร็จ และสัญญา">
      <ActionForm action={saveBusiness} resetOnSuccess={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อกิจการ / บริษัท" required className="sm:col-span-2">
            <input name="business_name" required defaultValue={s.business_name} className="input" />
          </Field>
          <Field label="ที่อยู่" className="sm:col-span-2">
            <textarea name="business_address" rows={2} defaultValue={s.business_address ?? ""} className="input min-h-0" />
          </Field>
          <Field label="เบอร์โทร">
            <input name="business_phone" type="tel" defaultValue={s.business_phone ?? ""} className="input" />
          </Field>
          <Field label="อีเมล">
            <input name="business_email" type="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={s.business_email ?? ""} className="input" />
          </Field>
          <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก จำเป็นเมื่อเปิดใช้ VAT">
            <input name="tax_id" inputMode="numeric" defaultValue={s.tax_id ?? ""} className="input tabular" />
          </Field>
        </div>
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function VatForm({ s }: { s: Settings }) {
  const [enabled, setEnabled] = useState(s.vat_enabled);
  return (
    <Section title="ภาษีมูลค่าเพิ่ม (VAT)" description="มีผลกับใบแจ้งหนี้ที่ออกหลังจากบันทึก ใบเดิมไม่เปลี่ยน">
      <ActionForm action={saveVat} resetOnSuccess={false}>
        <label className="flex items-center gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            name="vat_enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5 accent-ink"
          />
          <span>
            <span className="block text-sm font-medium">กิจการจดทะเบียนภาษีมูลค่าเพิ่ม</span>
            <span className="block text-xs text-muted">ใบเสร็จจะออกเป็น “ใบเสร็จรับเงิน/ใบกำกับภาษี”</span>
          </span>
        </label>
        {enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="อัตราภาษี (%)">
              <input name="vat_rate" type="number" step="0.01" min={0} max={30} defaultValue={s.vat_rate} className="input tabular" />
            </Field>
            <Field label="ราคาค่าเช่าที่ตั้งไว้">
              <select name="vat_inclusive" defaultValue={s.vat_inclusive ? "inclusive" : "exclusive"} className="input">
                <option value="inclusive">รวม VAT แล้ว (ยอดรวมเท่าเดิม แยก VAT ออกมาแสดง)</option>
                <option value="exclusive">ยังไม่รวม VAT (บวก VAT เพิ่มจากราคา)</option>
              </select>
            </Field>
          </div>
        )}
        {!enabled && <input type="hidden" name="vat_rate" value={s.vat_rate} />}
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function UnitTypesForm({ types }: { types: UnitType[] }) {
  return (
    <Section title="ประเภทห้องและราคาตั้งต้น" description="ราคาใหม่ใช้กับสัญญาที่ทำหลังจากนี้ ห้องที่ตั้งราคาเฉพาะไว้จะใช้ราคาของห้องนั้น">
      <ActionForm action={saveUnitTypes} resetOnSuccess={false}>
        <div className="space-y-3">
          {types.map((t) => (
            <div key={t.code} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_9rem]">
              <input type="hidden" name="code" value={t.code} />
              <Field label={`ชื่อ (รหัส ${t.code_prefix}-xx)`}>
                <input name={`name_${t.code}`} required defaultValue={t.name} className="input" />
              </Field>
              <Field label="ขนาด / รายละเอียด">
                <input name={`size_${t.code}`} defaultValue={t.size_label ?? ""} placeholder="เช่น 1.5 × 1 ม." className="input" />
              </Field>
              <Field label="บาท/เดือน" className="col-span-2 sm:col-span-1">
                <input
                  name={`price_${t.code}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={t.default_monthly_price}
                  className="input tabular"
                />
              </Field>
            </div>
          ))}
        </div>
        <SubmitButton>บันทึกราคา</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function DocumentsForm({ s }: { s: Settings }) {
  return (
    <Section title="เอกสาร" description="เลขเอกสารรันใหม่ทุกปี เช่น INV2569-0001">
      <ActionForm action={saveDocuments} resetOnSuccess={false}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="ใบแจ้งหนี้">
            <input name="invoice_prefix" required defaultValue={s.invoice_prefix} className="input uppercase" />
          </Field>
          <Field label="ใบเสร็จ">
            <input name="receipt_prefix" required defaultValue={s.receipt_prefix} className="input uppercase" />
          </Field>
          <Field label="สัญญา">
            <input name="contract_prefix" required defaultValue={s.contract_prefix} className="input uppercase" />
          </Field>
        </div>
        <Field label="ช่องทางการชำระเงิน (พิมพ์ในใบแจ้งหนี้)" hint="เช่น ชื่อธนาคาร เลขบัญชี ชื่อบัญชี หรือเลขพร้อมเพย์">
          <textarea name="payment_instructions" rows={3} defaultValue={s.payment_instructions ?? ""} className="input" />
        </Field>
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </Section>
  );
}

export function AlertsForm({ s }: { s: Settings }) {
  return (
    <Section title="การแจ้งเตือน" description="ใช้ในหน้าภาพรวม และรายการถึงรอบออกบิล">
      <ActionForm action={saveAlerts} resetOnSuccess={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="แสดงสัญญาที่ถึงรอบออกบิลล่วงหน้า (วัน)">
            <input name="due_soon_days" type="number" min={0} max={90} defaultValue={s.due_soon_days} className="input tabular" />
          </Field>
          <Field label="แจ้งสัญญาใกล้หมดล่วงหน้า (วัน)">
            <input name="expiring_soon_days" type="number" min={1} max={180} defaultValue={s.expiring_soon_days} className="input tabular" />
          </Field>
        </div>
        <SubmitButton>บันทึก</SubmitButton>
      </ActionForm>
    </Section>
  );
}

/** ช่องข้อมูลที่ใช้ในสัญญา ใช้ร่วมกับหน้าแก้ไขสาขา (ค่าเฉพาะสาขา) */
export function ContractTermsFields({
  values,
  placeholders,
  required,
}: {
  values: {
    lessor_name: string | null;
    bank_account: string | null;
    rent_due_day: number | null;
    late_fee_per_day: number | null;
    reclaim_day: number | null;
    overstay_fee_per_day: number | null;
  };
  placeholders?: Record<string, string>;
  required?: boolean;
}) {
  const ph = (k: string) => placeholders?.[k];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="ชื่อผู้ให้เช่า (ลงนามในสัญญา)" className="sm:col-span-2">
        <input name="lessor_name" defaultValue={values.lessor_name ?? ""} placeholder={ph("lessor_name") ?? "เช่น นายสมชาย ใจดี"} className="input" />
      </Field>
      <Field label="บัญชีธนาคารสำหรับรับชำระ" className="sm:col-span-2">
        <input name="bank_account" defaultValue={values.bank_account ?? ""} placeholder={ph("bank_account") ?? "เช่น กสิกรไทย เลขที่ 123-4-56789-0 ชื่อบัญชี ..."} className="input" />
      </Field>
      <Field label="ชำระค่าเช่าภายในวันที่" hint="ของเดือนที่ถึงกำหนด">
        <input name="rent_due_day" type="number" inputMode="numeric" min={1} max={31} required={required} defaultValue={values.rent_due_day ?? ""} placeholder={ph("rent_due_day")} className="input tabular" />
      </Field>
      <Field label="ค่าปรับชำระล่าช้า (บาท/วัน)">
        <input name="late_fee_per_day" type="number" inputMode="decimal" min={0} step="0.01" required={required} defaultValue={values.late_fee_per_day ?? ""} placeholder={ph("late_fee_per_day")} className="input tabular" />
      </Field>
      <Field label="ไม่ชำระภายในวันที่ … มีสิทธิ์ให้ผู้อื่นเช่า">
        <input name="reclaim_day" type="number" inputMode="numeric" min={1} max={31} required={required} defaultValue={values.reclaim_day ?? ""} placeholder={ph("reclaim_day")} className="input tabular" />
      </Field>
      <Field label="ค่าปรับไม่ย้ายออกหลังหมดสัญญา (บาท/วัน)">
        <input name="overstay_fee_per_day" type="number" inputMode="decimal" min={0} step="0.01" required={required} defaultValue={values.overstay_fee_per_day ?? ""} placeholder={ph("overstay_fee_per_day")} className="input tabular" />
      </Field>
    </div>
  );
}

export function ContractSettingsForm({ s }: { s: Settings }) {
  return (
    <Section title="สัญญาเช่า" description="ค่ากลางที่เติมลงในสัญญาทุกสาขา สาขาไหนต่างจากนี้ ตั้งเฉพาะสาขาได้ที่หน้าสาขา → แก้ไข">
      <ActionForm action={saveContractSettings} resetOnSuccess={false}>
        <ContractTermsFields values={s} required />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton>บันทึก</SubmitButton>
          <Link href="/settings/contract-template" className="btn btn-outline">
            <FileText className="size-4" /> แก้ไขถ้อยคำสัญญา
          </Link>
        </div>
      </ActionForm>
    </Section>
  );
}
