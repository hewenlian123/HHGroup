"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { approveSubcontractBillAction } from "./actions";

type Props = { billId: string };

export function ApproveBillButton({ billId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      await approveSubcontractBillAction(billId);
      syncRouterNonBlocking(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve bill.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="h-8 rounded-md border border-input bg-transparent px-2.5 text-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        {busy ? "…" : "Approve"}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </span>
  );
}
