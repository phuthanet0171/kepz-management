"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import type { Tenant } from "@/lib/types";

export function TenantFields({ tenant }: { tenant?: Tenant }) {
  const [type, setType] = useState(tenant?.tenant_type ?? "individual");
  const company = type === "company";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-line/50 p-1">
        {(
          [
            ["individual", "บุคคลธรรมดา"],
            ["company", "นิติบุคคล"],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className={`cursor-pointer rounded-lg py-2 text-center text-sm font-medium transition ${type === v ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            <input
              type="radio"
              name="tenant_type"
              value={v}
              checked={type === v}
              onChange={() => setType(v)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={company ? "ชื่อบริษัท" : "ชื่อ-นามสกุล"} required className="sm:col-span-2">
          <input name="full_name" required maxLength={200} defaultValue={tenant?.full_name} className="input" />
        </Field>
        <Field label="เบอร์โทร" required>
          <input name="phone" type="tel" inputMode="tel" required defaultValue={tenant?.phone} className="input" />
        </Field>
        <Field label="LINE ID">
          <input name="line_id" defaultValue={tenant?.line_id ?? ""} className="input" />
        </Field>
        <Field label="อีเมล">
          <input name="email" type="email" inputMode="email" defaultValue={tenant?.email ?? ""} className="input" />
        </Field>
        <Field
          label={company ? "เลขประจำตัวผู้เสียภาษี" : "เลขบัตรประชาชน"}
          hint="13 หลัก ใช้พิมพ์ในใบกำกับภาษีและสัญญา (ไม่บังคับ)"
        >
          <input
            name="id_number"
            inputMode="numeric"
            maxLength={17}
            defaultValue={tenant?.id_number ?? ""}
            className="input tabular"
          />
        </Field>
        <Field label="ที่อยู่" className="sm:col-span-2">
          <textarea name="address" rows={2} defaultValue={tenant?.address ?? ""} className="input min-h-0" />
        </Field>
        <Field label={company ? "ผู้ติดต่อ" : "ผู้ติดต่อฉุกเฉิน"}>
          <input name="emergency_contact_name" defaultValue={tenant?.emergency_contact_name ?? ""} className="input" />
        </Field>
        <Field label="เบอร์ผู้ติดต่อ">
          <input
            name="emergency_contact_phone"
            type="tel"
            inputMode="tel"
            defaultValue={tenant?.emergency_contact_phone ?? ""}
            className="input"
          />
        </Field>
        <Field label="หมายเหตุ" className="sm:col-span-2">
          <textarea name="note" rows={2} defaultValue={tenant?.note ?? ""} className="input min-h-0" />
        </Field>
      </div>
    </div>
  );
}
