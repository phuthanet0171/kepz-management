import { Suspense, type ReactNode } from "react";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-muted">กำลังเตรียมเอกสาร…</div>}>{children}</Suspense>
  );
}
