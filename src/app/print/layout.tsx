import { Suspense, type ReactNode } from "react";
import { BrandLoader } from "@/components/brand-loader";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="kepz-delayed grid min-h-dvh place-items-center bg-canvas">
          <BrandLoader size="lg" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
