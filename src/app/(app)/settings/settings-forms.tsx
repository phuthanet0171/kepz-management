"use client";

import { BellRing, Building2, FilePen, FileSignature, Hash } from "lucide-react";
import Link from "next/link";
import { Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import type { Settings } from "@/lib/types";
import { saveAlerts, saveBusiness, saveContractSettings, saveDocuments } from "./actions";
import { SAVE_CLASS, SaveBar, SettingsSection as Section } from "./settings-ui";

export function BusinessForm({ s, bare }: { s: Settings; bare?: boolean }) {
  return (
    <Section bare={bare} icon={Building2} title="ข้อมูลกิจการ" description="แสดงบนหัวใบวางบิล ใบเสร็จ และสัญญา">
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
            <input
              name="business_email"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={s.business_email ?? ""}
              className="input"
            />
          </Field>
          <Field label="เลขประจำตัวผู้เสียภาษี" hint="13 หลัก จำเป็นเมื่อเปิดใช้ VAT">
            <input name="tax_id" inputMode="numeric" defaultValue={s.tax_id ?? ""} className="input tabular" />
          </Field>
        </div>
        <SaveBar>
          <SubmitButton className={SAVE_CLASS}>บันทึกข้อมูลกิจการ</SubmitButton>
        </SaveBar>
      </ActionForm>
    </Section>
  );
}

export function DocumentsForm({ s }: { s: Settings }) {
  return (
    <Section icon={Hash} title="เลขเอกสารและช่องทางชำระเงิน" description="เลขเอกสารรันใหม่ทุกปี เช่น INV2569-0001">
      <ActionForm action={saveDocuments} resetOnSuccess={false}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="ใบวางบิล">
            <input name="invoice_prefix" required defaultValue={s.invoice_prefix} className="input uppercase" />
          </Field>
          <Field label="ใบเสร็จ">
            <input name="receipt_prefix" required defaultValue={s.receipt_prefix} className="input uppercase" />
          </Field>
          <Field label="สัญญา">
            <input name="contract_prefix" required defaultValue={s.contract_prefix} className="input uppercase" />
          </Field>
        </div>
        <Field label="ช่องทางการชำระเงิน (พิมพ์ในใบวางบิล)" hint="เช่น ชื่อธนาคาร เลขบัญชี ชื่อบัญชี หรือเลขพร้อมเพย์">
          <textarea name="payment_instructions" rows={3} defaultValue={s.payment_instructions ?? ""} className="input" />
        </Field>
        <SaveBar>
          <SubmitButton className={SAVE_CLASS}>บันทึกเลขเอกสาร</SubmitButton>
        </SaveBar>
      </ActionForm>
    </Section>
  );
}

export function AlertsForm({ s, bare }: { s: Settings; bare?: boolean }) {
  return (
    <Section bare={bare} icon={BellRing} title="การแจ้งเตือน" description="ใช้ในหน้าภาพรวม และรายการถึงรอบออกใบวางบิล">
      <ActionForm action={saveAlerts} resetOnSuccess={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="แสดงสัญญาที่ถึงรอบออกบิลล่วงหน้า (วัน)">
            <input name="due_soon_days" type="number" min={0} max={90} defaultValue={s.due_soon_days} className="input tabular" />
          </Field>
          <Field label="แจ้งสัญญาใกล้หมดล่วงหน้า (วัน)">
            <input
              name="expiring_soon_days"
              type="number"
              min={1}
              max={180}
              defaultValue={s.expiring_soon_days}
              className="input tabular"
            />
          </Field>
        </div>
        <SaveBar>
          <SubmitButton className={SAVE_CLASS}>บันทึกการแจ้งเตือน</SubmitButton>
        </SaveBar>
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
        <input
          name="lessor_name"
          defaultValue={values.lessor_name ?? ""}
          placeholder={ph("lessor_name") ?? "เช่น นายสมชาย ใจดี"}
          className="input"
        />
      </Field>
      <Field label="บัญชีธนาคารสำหรับรับชำระ" className="sm:col-span-2">
        <input
          name="bank_account"
          defaultValue={values.bank_account ?? ""}
          placeholder={ph("bank_account") ?? "เช่น กสิกรไทย เลขที่ 123-4-56789-0 ชื่อบัญชี ..."}
          className="input"
        />
      </Field>
      <Field label="ชำระค่าเช่าภายในวันที่" hint="ของเดือนที่ถึงกำหนด">
        <input
          name="rent_due_day"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          required={required}
          defaultValue={values.rent_due_day ?? ""}
          placeholder={ph("rent_due_day")}
          className="input tabular"
        />
      </Field>
      <Field label="ค่าปรับชำระล่าช้า (บาท/วัน)">
        <input
          name="late_fee_per_day"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required={required}
          defaultValue={values.late_fee_per_day ?? ""}
          placeholder={ph("late_fee_per_day")}
          className="input tabular"
        />
      </Field>
      <Field label="ไม่ชำระภายในวันที่ … มีสิทธิ์ให้ผู้อื่นเช่า">
        <input
          name="reclaim_day"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          required={required}
          defaultValue={values.reclaim_day ?? ""}
          placeholder={ph("reclaim_day")}
          className="input tabular"
        />
      </Field>
      <Field label="ค่าปรับไม่ย้ายออกหลังหมดสัญญา (บาท/วัน)">
        <input
          name="overstay_fee_per_day"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required={required}
          defaultValue={values.overstay_fee_per_day ?? ""}
          placeholder={ph("overstay_fee_per_day")}
          className="input tabular"
        />
      </Field>
    </div>
  );
}

export function ContractSettingsForm({ s }: { s: Settings }) {
  return (
    <Section
      icon={FileSignature}
      title="สัญญาเช่า"
      description="ค่ากลางที่เติมลงในสัญญาทุกสาขา สาขาไหนต่างจากนี้ ตั้งเฉพาะสาขาได้ที่หน้าสาขา → แก้ไข"
    >
      <ActionForm action={saveContractSettings} resetOnSuccess={false}>
        <ContractTermsFields values={s} required />
        <SaveBar>
          <Link href="/settings/contract-template" className="btn btn-outline mr-auto w-full sm:w-auto">
            <FilePen className="size-4" /> แก้ไขเนื้อหาสัญญา
          </Link>
          <SubmitButton className={SAVE_CLASS}>บันทึกสัญญาเช่า</SubmitButton>
        </SaveBar>
      </ActionForm>
    </Section>
  );
}
