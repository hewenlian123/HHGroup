import "./expenses-ui-theme.css";
import * as React from "react";
import { notFound } from "next/navigation";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadExpensesInitialData } from "@/lib/financial/expenses-initial-read";
import { emitRscTiming } from "@/lib/performance/server-timing";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { ExpensesPageClient } from "./expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const pageStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok) notFound();

  const serverDataStartedAt = performance.now();
  const initial = await loadExpensesInitialData(guard.client)
    .then((data) => ({ data }))
    .catch((error: unknown) => ({ error }));

  if ("error" in initial) {
    logServerPageDataError("financial/expenses", initial.error);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(initial.error, "expenses")}
        backHref="/financial"
        backLabel="Back to financial"
      />
    );
  }

  const serverDataCompletedAt = performance.now();
  const rscPreparedAt = performance.now();
  emitRscTiming("financial/expenses", {
    authMs: authDuration,
    serverDataMs: serverDataCompletedAt - serverDataStartedAt,
    rscPrepareMs: rscPreparedAt - serverDataCompletedAt,
    totalMs: rscPreparedAt - pageStartedAt,
  });

  return (
    <React.Suspense
      fallback={
        <div className="expenses-ui pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))]">
          <div className="expenses-ui-content page-shell-wide mx-auto w-full max-w-[430px] px-3 py-4 sm:max-w-[460px] md:px-8">
            <ExpensesListSkeleton rows={6} showStatCards mode="ledger" />
          </div>
        </div>
      }
    >
      <ExpensesPageClient pool="expenses" initialData={initial.data} />
    </React.Suspense>
  );
}
