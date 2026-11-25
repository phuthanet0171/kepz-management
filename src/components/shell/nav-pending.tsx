"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLoader } from "@/components/brand-loader";

/** เรียกก่อน router.push() เพื่อให้แสดงตัวโหลดเหมือนกดลิงก์ */
export function signalNavigation() {
  window.dispatchEvent(new Event("kepz:navigate"));
}

/**
 * ตัวโหลดระหว่างเปลี่ยนหน้า: กดลิงก์ภายในเว็บแล้วหน้าใหม่ยังไม่ขึ้นเกิน 0.5 วิ → โลโก้ kepz จุดเหลืองเด้งกลางจอ
 * ครอบคลุมการเปลี่ยนในหน้าเดิม (เช่น เปลี่ยนปี สาขา แท็บ) ที่ loading.tsx ไม่แสดง
 * ไม่บังการกด (pointer-events-none) หายเองเมื่อ URL เปลี่ยน หรือครบ 15 วิ
 */
export function NavPending() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = `${pathname}?${search}`;
  const [waiting, setWaiting] = useState(false);
  const [show, setShow] = useState(false);

  // หน้าใหม่ขึ้นแล้ว (URL เปลี่ยน) → ซ่อน
  const [lastUrl, setLastUrl] = useState(url);
  if (lastUrl !== url) {
    setLastUrl(url);
    setWaiting(false);
    setShow(false);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin || to.pathname.startsWith("/api/")) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return; // หน้าเดิม / #anchor
      setWaiting(true);
    };
    const onSignal = () => setWaiting(true);
    // ฟังตอนฟองขึ้นมาถึง document: ถ้าหน้าไหนกันการเปลี่ยนหน้าไว้ (preventDefault) จะไม่แสดง
    document.addEventListener("click", onClick);
    window.addEventListener("kepz:navigate", onSignal);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("kepz:navigate", onSignal);
    };
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setShow(true), 500);
    const giveUp = setTimeout(() => {
      setWaiting(false);
      setShow(false);
    }, 15000);
    return () => {
      clearTimeout(t);
      clearTimeout(giveUp);
    };
  }, [waiting]);

  if (!show) return null;
  return (
    <div className="no-print pointer-events-none fixed inset-0 z-[35] grid place-items-center lg:pl-64">
      <div className="kepz-delayed rounded-3xl bg-surface/95 px-8 py-6 shadow-lg ring-1 ring-line">
        <BrandLoader size="lg" />
      </div>
    </div>
  );
}
