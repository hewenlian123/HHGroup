import { Suspense, type ReactNode } from "react";
import { FinanceSectionNav } from "@/components/financial/finance-section-nav";

export default function FinanceSectionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <FinanceSectionNav />
      </Suspense>
      {children}
    </>
  );
}
