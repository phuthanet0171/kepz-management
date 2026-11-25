import clsx from "clsx";

/**
 * ตัวโหลดของ Kepz (แบบ B1): โลโก้ kepz จุดเหลืองเด้ง
 * ใช้ทุกที่ที่ต้องรอ: เปิดแอป เปลี่ยนหน้า ข้อมูลกำลังโหลด เตรียมเอกสาร
 * ไม่มี JS (เป็น CSS ล้วน) จึงแสดงได้ทันทีตั้งแต่ HTML แรก
 */
export function BrandLoader({
  label = "กำลังโหลด…",
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

/** พื้นที่เนื้อหาระหว่างรอ: ตัวโหลดอยู่กลาง ค่อยๆ ปรากฏหลัง 0.3 วิ (โหลดเร็วจะไม่เห็นกะพริบ) */
export function PageLoader({ label }: { label?: string | null }) {
  return (
    <div className="kepz-delayed grid min-h-[60dvh] place-items-center">
      <BrandLoader label={label} />
    </div>
  );
}
