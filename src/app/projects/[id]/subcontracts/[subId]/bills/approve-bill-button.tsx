"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { approveSubcontractBillAction } from "./actions";

type Props = { projectId: string; subcontractId: string; billId: string };

export function ApproveBillButton({ projectId, subcontractId, billId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await approveSubcontractBillAction(projectId, subcontractId, billId);
      if (!result.ok) {
        setError(result.error ?? "Failed to approve bill.");
        return;
      }
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
        className="min-h-[44px] rounded-hh-standard border border-input bg-transparent px-2.5 text-hh-metadata hover:bg-accent hover:text-accent-foreground disabled:opacity-50 xl:min-h-8"
      >
        {busy ? "…" : "Approve"}
      </button>
      {error ? <span className="text-hh-metadata text-[var(--hh-danger)]">{error}</span> : null}
    </span>
  );
}
