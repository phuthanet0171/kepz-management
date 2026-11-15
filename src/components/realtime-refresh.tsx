"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["units", "contracts", "invoices", "payments", "floor_plans", "unit_placements"];

/**
 * ฟังการเปลี่ยนแปลงจาก Supabase Realtime แล้วโหลดข้อมูลหน้านี้ใหม่
 * (เช่น อีกเครื่องรับชำระหรือทำสัญญา สีห้องบนผังจะเปลี่ยนทันที)
 */
export function RealtimeRefresh({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel(`kepz-live-${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));

    // กลับมาที่แท็บ/แอปหลังพักไว้ ให้โหลดข้อมูลล่าสุด
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [enabled, router]);

  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={live ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ"}>
      <span className={`size-2 rounded-full ${live ? "animate-pulse bg-ok" : "bg-line"}`} />
      {live ? "เรียลไทม์" : "กำลังเชื่อมต่อ…"}
    </span>
  );
}
