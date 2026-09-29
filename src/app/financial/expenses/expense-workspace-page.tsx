import "./expenses-ui-theme.css";
import * as React from "react";
import { PermissionDenied } from "@/components/ui/system-state";
import { ExpensesListSkeleton } from "@/components/financial/expenses-list-skeleton";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadExpensesInitialData } from "@/lib/financial/expenses-initial-read";
import { emitRscTiming } from "@/lib/performance/server-timing";
import { logServerPageDataError } from "@/lib/server-load-warning";
import { ExpensesPageClient } from "./expenses-client";

export async function ExpenseWorkspacePage({ pool }: { pool: "expenses" | "inbox" | "overview" }) {
  const pageStartedAt = performance.now();
  const authStartedAt = performance.now();
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const authDuration = performance.now() - authStartedAt;
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );

  const serverDataStartedAt = performance.now();
  const initial = await loadExpensesInitialData(guard.client, pool)
    .then((data) => ({ data }))
    .catch((error: unknown) => ({ error }));

  if ("error" in initial) {
    logServerPageDataError("financial/expenses", initial.error);
    return <FinanceUnavailable title="Expenses unavailable" />;
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
        <div className="expenses-ui">
          <div className="expenses-ui-content expenses-page-shell">
            <ExpensesListSkeleton rows={6} showStatCards mode="ledger" />
          </div>
        </div>
      }
    >
      <ExpensesPageClient pool={pool} initialData={initial.data} />
    </React.Suspense>
  );
}
