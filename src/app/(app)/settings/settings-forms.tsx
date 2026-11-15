"use client";

import { useState } from "react";
import { Card, CardHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import type { Settings, UnitType } from "@/lib/types";
import { changePassword, saveAlerts, saveBusiness, saveDocuments, saveUnitTypes, saveVat } from "./actions";

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
            <input name="business_email" type="email" defaultValue={s.business_email ?? ""} className="input" />
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
        <Field label="ข้อกำหนดและเงื่อนไขในสัญญาเช่า" hint="พิมพ์ทีละข้อ ขึ้นบรรทัดใหม่ต่อข้อ จะแสดงในหน้าพิมพ์สัญญา">
          <textarea name="contract_terms" rows={8} defaultValue={s.contract_terms ?? ""} className="input" />
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

export function PasswordForm({ email }: { email: string }) {
  return (
    <Section title="บัญชีผู้ใช้" description={email}>
      <ActionForm action={changePassword}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัวอักษร">
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่">
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
          </Field>
        </div>
        <SubmitButton>เปลี่ยนรหัสผ่าน</SubmitButton>
      </ActionForm>
    </Section>
  );
}
