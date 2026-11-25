import clsx from "clsx";

/**
 * ตัวโหลดของ Kepz (แบบ B1): โลโก้ kepz จุดเหลืองเด้ง
 * ใช้ทุกที่ที่ต้องรอ: เปิดแอป เปลี่ยนหน้า ข้อมูลกำลังโหลด เตรียมเอกสาร
 * ไม่มี JS (เป็น CSS ล้วน) จึงแสดงได้ทันทีตั้งแต่ HTML แรก
 */
export function BrandLoader({
  label = null,
  size = "md",
  className,
}: {
  label?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={clsx("flex flex-col items-center justify-center gap-2.5", className)}>
      <span
        aria-hidden
        className={clsx(
          "inline-flex items-baseline leading-none font-bold tracking-tight text-ink",
          size === "lg" ? "text-5xl" : size === "sm" ? "text-2xl" : "text-4xl",
        )}
      >
        kepz<span className="kepz-dot text-brand-strong">.</span>
      </span>
      {label ? <span className="text-sm text-muted">{label}</span> : <span className="sr-only">กำลังโหลด</span>}
    </div>
  );
}

/** ระหว่างรอ: ตัวโหลดอยู่กลางจอ (บนคอมกลางพื้นที่ข้างเมนู) ค่อยๆ ปรากฏหลัง 0.3 วิ ไม่กะพริบตอนโหลดเร็ว */
export function PageLoader() {
  return (
    <div className="min-h-[60dvh]">
      <div className="kepz-delayed pointer-events-none fixed inset-0 z-20 grid place-items-center lg:pl-64">
        <BrandLoader size="lg" />
      </div>
    </div>
  );
}
