"use client";

import { Ban, Camera, CheckCircle2, Loader2, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui";
import { ActionForm, Sheet, SubmitButton } from "@/components/ui/client";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { recordPayment, voidInvoice, voidPayment } from "../actions";

/** ย่อรูปสลิปให้กว้างไม่เกิน 1600px เพื่ออัปโหลดเร็วบนมือถือ (ถ้าย่อไม่ได้จะส่งไฟล์เดิม) */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

function SlipUpload({ invoiceId }: { invoiceId: string }) {
  const [state, setState] = useState<{ status: "idle" | "uploading" | "done" | "error"; path?: string; name?: string; error?: string }>({
    status: "idle",
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 15_000_000) {
      setState({ status: "error", error: "ไฟล์ใหญ่เกินไป (ไม่เกิน 15 MB)" });
      return;
    }
    setState({ status: "uploading", name: file.name });
    const blob = await shrinkImage(file);
    if (blob.size > 5_000_000) {
      setState({ status: "error", error: "ไฟล์ใหญ่เกิน 5 MB กรุณาถ่ายใหม่หรือแคปหน้าจอสลิป" });
      return;
    }
    const isPdf = file.type === "application/pdf";
    const ext = isPdf ? "pdf" : blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${invoiceId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient()
      .storage.from("slips")
      .upload(path, blob, { contentType: isPdf ? "application/pdf" : blob.type || file.type, upsert: false });
    if (error) {
      setState({ status: "error", error: "อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่" });
      return;
    }
    setState({ status: "done", path, name: file.name });
  }

  return (
    <div>
      <span className="label">สลิป / หลักฐานการชำระ</span>
      <input type="hidden" name="slip_path" value={state.path ?? ""} />
      {state.status === "done" ? (
        <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft px-3 py-2.5 text-sm text-ok">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="truncate">แนบแล้ว: {state.name}</span>
          <button type="button" onClick={() => setState({ status: "idle" })} className="ml-auto" aria-label="เอาสลิปออก">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-4 text-sm text-muted transition hover:border-ink/30 hover:text-ink">
          {state.status === "uploading" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> กำลังอัปโหลด…
            </>
          ) : (
            <>
              <Camera className="size-4" /> ถ่ายรูปหรือเลือกไฟล์สลิป (ไม่บังคับ)
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={state.status === "uploading"}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      )}
      {state.status === "error" && <p className="mt-1 text-xs text-bad">{state.error}</p>}
    </div>
  );
}

/** บันทึกรับชำระ แล้วเปิดหน้าใบเสร็จให้พิมพ์ต่อทันที */
export function RecordPaymentButton({
  invoiceId,
  outstanding,
  today,
  label = "รับชำระ",
  triggerClassName = "btn btn-brand",
}: {
  invoiceId: string;
  outstanding: number;
  today: string;
  label?: string;
  triggerClassName?: string;
}) {
  return (
    <Sheet
      title="บันทึกรับชำระ"
      description={`ยอดค้าง ${money(outstanding)} บาท · บันทึกแล้วจะเปิดใบเสร็จให้พิมพ์ทันที`}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Wallet className="size-4" /> {label}
        </>
      }
    >
      {(close) => (
        <ActionForm action={recordPayment} onSuccess={close}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ยอดที่ได้รับ (บาท)" required hint="รับบางส่วนได้ ไม่เกินยอดค้าง">
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                max={outstanding}
                step="0.01"
                required
                defaultValue={outstanding}
                className="input tabular text-lg font-semibold"
              />
            </Field>
            <Field label="วันที่ชำระ" required>
              <input name="paid_on" type="date" required max={today} defaultValue={today} className="input" />
            </Field>
          </div>
          <Field label="ช่องทาง" required>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["transfer", "โอนเงิน / พร้อมเพย์"],
                  ["credit_card", "บัตรเครดิต"],
                ] as const
              ).map(([v, label], i) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name="method" value={v} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="block rounded-xl border-2 border-line px-3 py-2.5 text-center text-sm font-medium transition peer-checked:border-ink peer-checked:bg-brand-soft">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="เลขอ้างอิง / 4 หลักท้ายบัตร">
            <input name="reference" className="input" />
          </Field>
          <SlipUpload invoiceId={invoiceId} />
          <Field label="หมายเหตุ">
            <input name="note" className="input" />
          </Field>
          <SubmitButton className="btn btn-primary w-full">บันทึกและพิมพ์ใบเสร็จ</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Sheet
      title="ยกเลิกใบวางบิล"
      triggerClassName="btn btn-danger"
      trigger={
        <>
          <Ban className="size-4" /> ยกเลิกบิล
        </>
      }
    >
      {(close) => (
        <ActionForm action={voidInvoice} onSuccess={close}>
          <input type="hidden" name="id" value={invoiceId} />
          <p className="text-sm text-ink-2">
            ใบวางบิลจะถูกทำเครื่องหมายยกเลิกแต่ยังเก็บไว้ในระบบ เลขที่บิลนี้จะไม่ถูกนำกลับมาใช้ใหม่
            และสามารถออกบิลใหม่สำหรับรอบเดียวกันได้
          </p>
          <Field label="เหตุผลการยกเลิก" required>
            <input name="reason" required className="input" placeholder="เช่น ยอดผิด ออกบิลซ้ำ" />
          </Field>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90">ยืนยันยกเลิกใบวางบิล</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function VoidPaymentButton({ paymentId, receiptNo }: { paymentId: string; receiptNo: string }) {
  return (
    <Sheet
      title={`ยกเลิกใบเสร็จ ${receiptNo}`}
      triggerClassName="btn btn-ghost btn-sm text-bad"
      trigger="ยกเลิก"
    >
      {(close) => (
        <ActionForm action={voidPayment} onSuccess={close}>
          <input type="hidden" name="id" value={paymentId} />
          <p className="text-sm text-ink-2">ยอดชำระนี้จะถูกหักออกจากใบวางบิล และใบเสร็จจะแสดงสถานะ “ยกเลิก”</p>
          <Field label="เหตุผลการยกเลิก" required>
            <input name="reason" required className="input" placeholder="เช่น บันทึกยอดผิด เช็คสลิปแล้วไม่พบยอดโอน" />
          </Field>
          <SubmitButton className="btn w-full bg-bad text-white hover:bg-bad/90">ยืนยันยกเลิกใบเสร็จ</SubmitButton>
        </ActionForm>
      )}
    </Sheet>
  );
}
