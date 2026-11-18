"use client";

import clsx from "clsx";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Card, CardHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import type { DocWatermark } from "@/lib/types";
import { saveWatermark } from "./actions";

const MAX_SIDE = 1600; // px ด้านยาวสุด พอสำหรับพิมพ์ A4 ให้คม
const MAX_DATA_URL = 2_000_000; // ตัวอักษร (≈1.5 MB)

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** ย่อรูปให้พอดีงานพิมพ์ เก็บพื้นใสไว้ (PNG) ถ้าใหญ่เกินจะลดขนาดลงอีก */
async function prepareImage(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    const url = await readAsDataUrl(file);
    if (url.length > MAX_DATA_URL) throw new Error("ไฟล์ SVG ใหญ่เกินไป (ไม่เกิน 1.5 MB)");
    return url;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ PNG, JPG, WEBP หรือ SVG");
  }
  const bitmap = await createImageBitmap(file);
  for (const side of [MAX_SIDE, 1200, 900]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9));
    if (!blob) break;
    const url = await readAsDataUrl(blob);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error("รูปใหญ่เกินไป กรุณาใช้รูปที่เล็กลง");
}

/** หน้ากระดาษ A4 จำลอง ให้เห็นลายน้ำจริงก่อนบันทึก */
function PagePreview({ image, opacity, size, enabled }: { image: string | null; opacity: number; size: number; enabled: boolean }) {
  return (
    <div className="relative mx-auto aspect-[210/297] w-full max-w-[15rem] overflow-hidden rounded-md border border-line bg-white shadow-sm">
      {image && enabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-[80%] object-contain" style={{ width: `${size}%`, opacity: opacity / 100 }} />
        </div>
      )}
      {/* เนื้อหาจำลอง */}
      <div className="relative space-y-[5%] p-[9%]">
        <div className="flex items-start justify-between">
          <div className="h-2.5 w-1/4 rounded-sm bg-ink" />
          <div className="h-2 w-1/5 rounded-sm bg-brand" />
        </div>
        <div className="h-[3px] w-full rounded bg-brand" />
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-1.5 rounded-sm bg-ink/15" style={{ width: `${[92, 80, 88, 70, 95, 84, 60, 90, 76][i]}%` }} />
        ))}
        <div className="h-3 w-full rounded-sm bg-ink" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-1.5 rounded-sm bg-ink/15" style={{ width: `${[85, 72, 90, 64][i]}%` }} />
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  name,
  value,
  min,
  max,
  onChange,
  left,
  right,
  disabled,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("block", disabled && "opacity-50")}>
      <span className="label flex justify-between">
        {label} <span className="tabular text-muted">{value}%</span>
      </span>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ink"
      />
      <span className="flex justify-between text-xs text-muted">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    </label>
  );
}

export function WatermarkForm({ wm }: { wm: DocWatermark | null }) {
  const [image, setImage] = useState<string | null>(wm?.image ?? null);
  const [changed, setChanged] = useState(false); // รูปเปลี่ยนหรือถูกลบ (ส่งรูปไปเฉพาะตอนเปลี่ยน)
  const [enabled, setEnabled] = useState(wm?.enabled ?? true);
  const [opacity, setOpacity] = useState(wm?.opacity ?? 8);
  const [size, setSize] = useState(wm?.size ?? 60);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    setBusy(true);
    try {
      setImage(await prepareImage(file));
      setChanged(true);
      setEnabled(true);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "อ่านไฟล์รูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="ลายน้ำบนเอกสาร"
        description="รูปจางๆ กลางกระดาษ ทุกหน้าของสัญญาเช่า ใบวางบิล และใบเสร็จ ทั้งตอนพิมพ์และบันทึก PDF"
      />
      {!wm ? (
        <div className="p-4 sm:p-5">
          <Alert tone="warn">
            ยังใช้ลายน้ำไม่ได้ กรุณารันไฟล์ <b>0009_doc_watermark.sql</b> ใน Supabase SQL Editor ก่อน
          </Alert>
        </div>
      ) : (
        <ActionForm action={saveWatermark} resetOnSuccess={false} onSuccess={() => setChanged(false)} className="p-4 sm:p-5">
          <input type="hidden" name="image_changed" value={changed ? "1" : "0"} />
          {changed && <input type="hidden" name="image" value={image ?? ""} />}
          <input type="hidden" name="enabled" value={enabled ? "1" : "0"} />

          <div className="grid gap-5 sm:grid-cols-[15rem_1fr]">
            <div>
              <PagePreview image={image} opacity={opacity} size={size} enabled={enabled} />
              <p className="mt-1.5 text-center text-xs text-muted">ตัวอย่างหน้ากระดาษ A4</p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <label className={clsx("btn btn-outline cursor-pointer", busy && "pointer-events-none opacity-60")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  {image ? "เปลี่ยนรูป" : "เลือกรูปลายน้ำ"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => {
                      onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {image && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setImage(null);
                      setChanged(true);
                    }}
                  >
                    <Trash2 className="size-4" /> ลบรูป
                  </button>
                )}
              </div>
              {fileError && <p className="text-sm text-bad">{fileError}</p>}
              {!image && !fileError && (
                <p className="text-sm text-muted">แนะนำโลโก้ไฟล์ PNG พื้นใส หรือ SVG ระบบจะทำให้จางและวางกลางหน้าให้เอง</p>
              )}

              {image && (
                <>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="size-5 accent-ink"
                    />
                    <span className="text-sm font-medium">แสดงลายน้ำบนเอกสาร</span>
                  </label>
                  <Slider
                    label="ความเข้ม"
                    name="opacity"
                    value={opacity}
                    min={3}
                    max={25}
                    onChange={setOpacity}
                    left="จาง"
                    right="เข้ม"
                    disabled={!enabled}
                  />
                  <Slider
                    label="ขนาด"
                    name="size"
                    value={size}
                    min={30}
                    max={90}
                    onChange={setSize}
                    left="เล็ก"
                    right="เต็มหน้า"
                    disabled={!enabled}
                  />
                  <p className="text-xs text-muted">แนะนำความเข้ม 6–10% ตัวหนังสือยังอ่านง่าย และพิมพ์เครื่องขาวดำก็ไม่เปลืองหมึก</p>
                </>
              )}
              {/* ค่าเดิมเมื่อยังไม่มีรูป (slider ไม่แสดง) */}
              {!image && (
                <>
                  <input type="hidden" name="opacity" value={opacity} />
                  <input type="hidden" name="size" value={size} />
                </>
              )}

              <SubmitButton disabled={busy}>บันทึกลายน้ำ</SubmitButton>
            </div>
          </div>
        </ActionForm>
      )}
    </Card>
  );
}
