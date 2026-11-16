"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Card, EmptyState } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <Card>
      <EmptyState
        icon={<WifiOff className="size-6" />}
        title="โหลดข้อมูลไม่สำเร็จ"
        description="อาจเกิดจากสัญญาณอินเทอร์เน็ตไม่เสถียร กรุณาลองใหม่อีกครั้ง"
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
          >
            <RefreshCw className="size-4" /> ลองใหม่
          </button>
        }
      />
    </Card>
  );
}
