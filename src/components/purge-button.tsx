"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { money } from "@/lib/format";
import { purgeBranch, purgeTenant } from "@/lib/purge";

export type PurgePreview = {
  contracts: number;
  active_contracts: number;
  invoices: number;
  payments: number;
  paid_total: number;
  units: number;
};

/** ลบถาวรพร้อมประวัติ (เฉพาะ Owner) ต้องพิมพ์ชื่อให้ตรงจึงจะลบได้ */
export function PurgeButton({
  kind,
  id,
  name,
  preview,
}: {
  kind: "tenant" | "branch";
  id: string;
  name: string;
  preview: PurgePreview;
}) {
  const label = kind === "tenant" ? "ผู้เช่า" : "สาขา";
  const hasHistory = preview.contracts > 0;
  const rows = [
    kind === "branch" && { label: "ห้องและที่จอด", value: `${preview.units} หน่วย` },
    { label: "สัญญาเช่า", value: `${preview.contracts} สัญญา${preview.active_contracts ? ` (ใช้งานอยู่ ${preview.active_contracts})` : ""}` },
    { label: "ใบวางบิล", value: `${preview.invoices} ใบ` },
    { label: "ใบเสร็จ / การรับชำระ", value: `${preview.payments} ใบ · ${money(preview.paid_total)} บาท` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Sheet
      title={`ลบ${label}ถาวร`}
      triggerClassName="btn btn-danger btn-sm"
      trigger={
        <>
          <Trash2 className="size-3.5" /> ลบ{label}
        </>
      }
    >
      {() => (
        <ActionForm action={kind === "tenant" ? purgeTenant : purgeBranch}>
          <input type="hidden" name="id" value={id} />
          {hasHistory || kind === "branch" ? (
            <div className="rounded-xl border border-bad/30 bg-bad-soft p-3.5 text-sm text-bad">
              <div className="mb-2 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> ข้อมูลต่อไปนี้จะถูกลบถาวรและกู้คืนไม่ได้
              </div>
              <dl className="space-y-1">
                {rows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-3">
                    <dt>{r.label}</dt>
                    <dd className="tabular font-medium">{r.value}</dd>
                  </div>
                ))}
              </dl>
              {hasHistory && (
                <p className="mt-2 border-t border-bad/20 pt-2 text-xs">
                  ใบวางบิลและใบเสร็จที่เคยออกให้ลูกค้าจะหายจากระบบและรายงานรายได้ เลขเอกสารที่ถูกลบจะไม่ถูกนำกลับมาใช้
                  {kind === "branch" && " ผู้เช่ายังอยู่ในระบบ ลบแยกได้ที่หน้าผู้เช่า"}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-2">ผู้เช่ารายนี้ไม่มีประวัติสัญญา การลบกู้คืนไม่ได้</p>
          )}
          {hasHistory && (
            <p className="text-xs text-muted">แนะนำให้ส่งออก CSV จากหน้ารายงานเก็บไว้ก่อนลบ</p>
          )}
          <Field label={<>พิมพ์ “{name}” เพื่อยืนยัน</>} required>
            <input name="confirm_name" required autoComplete="off" className="input" />
          </Field>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90" pendingText="กำลังลบ…">
            ลบ{label}ถาวร
          </SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
