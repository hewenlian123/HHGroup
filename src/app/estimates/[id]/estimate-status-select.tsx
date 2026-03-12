import { Button } from "@/components/ui/button";
import { changeEstimateStatusAction } from "./actions";

const STATUSES = ["Draft", "Sent", "Approved", "Rejected", "Converted"] as const;

export function EstimateStatusSelect({ estimateId, currentStatus }: { estimateId: string; currentStatus: string }) {
  return (
    <form action={changeEstimateStatusAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="estimateId" value={estimateId} />
      <select
        name="newStatus"
        defaultValue={currentStatus}
        className="h-8 rounded-lg border border-zinc-200/60 dark:border-border bg-background px-3 text-sm text-foreground"
        aria-label="Change status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" className="rounded-lg shrink-0">
        Update
      </Button>
    </form>
  );
}
