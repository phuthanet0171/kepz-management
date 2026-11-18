"use client";

import { Printer, X } from "lucide-react";
import { useEffect } from "react";

export function PrintToolbar({ title }: { title: string }) {
  // ?print=1 = เปิดหน้าต่างพิมพ์/บันทึก PDF ให้อัตโนมัติ (เช่น หลังบันทึกรับชำระ)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("print") !== "1") return;
    url.searchParams.delete("print");
    window.history.replaceState(window.history.state, "", url); // รีเฟรชแล้วไม่เด้งซ้ำ
    let cancelled = false;
    // รอฟอนต์ไทยโหลดเสร็จก่อน ไม่งั้น PDF จะได้ฟอนต์สำรอง
    document.fonts.ready.then(() => setTimeout(() => !cancelled && window.print(), 300));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="no-print sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 px-4 py-2.5">
        <span className="truncate text-sm font-medium">{title}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
          >
            <X className="size-3.5" /> ปิด
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>
    </div>
  );
}
