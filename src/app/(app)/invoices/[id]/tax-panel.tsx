"use client";

import { Lock, Printer } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { TaxPicker, TaxSummary } from "@/components/tax-picker";
import { Alert, Card, CardHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { computeTax, type TaxChoice } from "@/lib/tax";
import { setInvoiceTax } from "../actions";

/** เลือกภาษีก่อนพิมพ์/ส่งใบวางบิล (แก้ได้จนกว่าจะมีการรับชำระ) */
export function InvoiceTaxPanel({
  invoiceId,
  itemsSum,
  initial,
  lockedReason,
  hasTaxId,
  payButton,
}: {
  invoiceId: string;
  itemsSum: number;
  initial: TaxChoice;
  lockedReason: string | null;
  hasTaxId: boolean;
  /** ปุ่มรับชำระ แสดงใต้ปุ่มพิมพ์ใบวางบิล (ซ่อนระหว่างแก้ภาษีที่ยังไม่บันทึก) */
  payButton?: ReactNode;
}) {
  const [tax, setTax] = useState<TaxChoice>(initial);
  const [saved, setSaved] = useState<TaxChoice>(initial);
  const dirty = tax.vat !== saved.vat || tax.wht !== saved.wht || (tax.vat && tax.inclusive !== saved.inclusive);
  const t = computeTax(itemsSum, tax);

  return (
    <Card>
      <CardHeader
        title={payButton ? "พิมพ์ใบวางบิลและรับชำระ" : "ภาษีและพิมพ์ใบวางบิล"}
        description={lockedReason ? undefined : "เลือกภาษีให้ตรงกับลูกค้า แล้วกดพิมพ์"}
      />
      <ActionForm
        action={setInvoiceTax}
        resetOnSuccess={false}
        onSuccess={() => setSaved(tax)}
        className="space-y-4 p-4 sm:p-5"
      >
        <input type="hidden" name="id" value={invoiceId} />
        <TaxPicker value={tax} onChange={setTax} disabled={Boolean(lockedReason)} stacked />
        {lockedReason && (
          <p className="flex items-start gap-2 text-xs text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> {lockedReason}
          </p>
        )}
        {tax.vat && !hasTaxId && !lockedReason && (
          <Alert tone="warn">กรอกเลขประจำตัวผู้เสียภาษีของกิจการที่ ตั้งค่า → ข้อมูลกิจการ ก่อนใช้ VAT</Alert>
        )}

        <TaxSummary t={t} choice={tax} className="rounded-xl bg-canvas px-3.5 py-3" />

        {dirty ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <SubmitButton className="btn btn-primary w-full" pendingText="กำลังบันทึก…">
              บันทึกภาษี
            </SubmitButton>
            <button type="button" className="btn btn-outline w-full" onClick={() => setTax(saved)}>
              ยกเลิก
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Link href={`/print/invoice/${invoiceId}`} target="_blank" className="btn btn-primary w-full">
              <Printer className="size-4" /> พิมพ์ใบวางบิล
            </Link>
            {payButton}
          </div>
        )}
        {dirty && <p className="text-center text-xs text-muted">บันทึกก่อน แล้วจึงพิมพ์ใบวางบิลได้</p>}
      </ActionForm>
    </Card>
  );
}
