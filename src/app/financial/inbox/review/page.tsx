import "../../expenses/expenses-ui-theme.css";
import * as React from "react";
import { PermissionDenied } from "@/components/ui/system-state";
import { FinanceUnavailable } from "@/components/financial/finance-unavailable";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { loadExpensesInitialData } from "@/lib/financial/expenses-initial-read";
import { logServerPageDataError } from "@/lib/server-load-warning";
import { InboxReviewClient } from "./inbox-review-client";

export const dynamic = "force-dynamic";

export default async function InboxReviewPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) {
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  }

  const initial = await loadExpensesInitialData(guard.client)
    .then((data) => ({ data }))
    .catch((error: unknown) => ({ error }));

  if ("error" in initial) {
    logServerPageDataError("financial/inbox/review", initial.error);
    return <FinanceUnavailable title="Inbox review unavailable" />;
  }

  return (
    <div className="expenses-ui">
      <div className="expenses-ui-content expenses-page-shell">
        <InboxReviewClient initialData={initial.data} />
      </div>
    </div>
  );
}
