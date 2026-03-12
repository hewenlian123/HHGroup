"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SubcontractWithSubcontractor } from "@/lib/data";
import { updateSubcontractStatusAction } from "./actions";

const STATUSES: Array<SubcontractWithSubcontractor["status"]> = ["Draft", "Active", "Completed", "Cancelled"];

export function SubcontractDetailClient({
  projectId,
  subcontract,
}: {
  projectId: string;
  subcontract: SubcontractWithSubcontractor;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(subcontract.status ?? "Draft");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setStatus(subcontract.status ?? "Draft"), [subcontract.status]);

  const handleChange = async (next: SubcontractWithSubcontractor["status"]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await updateSubcontractStatusAction(projectId, subcontract.id, next);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    } else {
      setError(res.error ?? "Failed to update status.");
    }
    setBusy(false);
  };

  const allowedTransitions = (cur: SubcontractWithSubcontractor["status"]) => {
    if (cur === "Draft") return ["Draft", "Active"] as const;
    if (cur === "Active") return ["Active", "Completed", "Cancelled"] as const;
    return [cur] as const;
  };

  const options = allowedTransitions(status);
  const optionsSet = React.useMemo(() => new Set<string>(options as unknown as string[]), [options]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Status</span>
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value as SubcontractWithSubcontractor["status"])}
        disabled={busy || options.length <= 1}
        className="h-8 rounded border border-input bg-transparent px-2 text-xs"
      >
        {STATUSES.filter((s) => optionsSet.has(s)).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button asChild variant="outline" size="sm" className="h-8">
        <Link href={`/projects/${projectId}/subcontracts/${subcontract.id}/bills`}>Bills</Link>
      </Button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}

