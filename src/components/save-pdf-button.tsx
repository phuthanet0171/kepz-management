"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";

/**
 * บันทึกหน้านี้เป็น PDF ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์ (เลือก "บันทึกเป็น PDF")
 * ใช้ได้ทั้งคอมและมือถือ · ตั้งชื่อไฟล์จาก fileName ชั่วคราวระหว่างพิมพ์
 */
export function SavePdfButton({ fileName, className = "btn btn-primary" }: { fileName: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const prev = document.title;
    document.title = fileName; // เบราว์เซอร์ใช้ชื่อหน้าเป็นชื่อไฟล์ PDF
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    try {
      // รอฟอนต์ไทยโหลดครบ ไม่งั้น PDF จะได้ฟอนต์สำรอง
      await document.fonts.ready;
      window.print();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={save} disabled={busy}>
      <FileDown className="size-4" /> บันทึก PDF
    </button>
  );
}
