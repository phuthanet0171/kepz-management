"use client";

import { Printer, X } from "lucide-react";

export function PrintToolbar({ title }: { title: string }) {
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
