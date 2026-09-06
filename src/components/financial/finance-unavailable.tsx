"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorRetry, LoadingState } from "@/components/ui/system-state";

export function FinanceUnavailable({ title = "Financial data unavailable" }: { title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="page-container py-6">
      {pending ? (
        <LoadingState text="Loading financial data…" />
      ) : (
        <ErrorRetry
          title={title}
          description="The requested data could not be read. Amounts will appear after a successful read."
          onRetry={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}
