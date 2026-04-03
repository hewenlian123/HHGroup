import { Button } from "@/components/ui/button";
import {
  sendEstimateAction,
  approveEstimateAction,
  rejectEstimateAction,
  convertToProjectAction,
} from "./actions";

type EstimateStatus = "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";

export function EstimateStatusActions({
  estimateId,
  status,
}: {
  estimateId: string;
  status: string;
}) {
  const s = status as EstimateStatus;

  if (s === "Draft") {
    return (
      <form action={sendEstimateAction} className="inline">
        <input type="hidden" name="estimateId" value={estimateId} />
        <Button type="submit" size="sm" className="rounded-lg">
          Send Estimate
        </Button>
      </form>
    );
  }

  if (s === "Sent") {
    return (
      <div className="flex items-center gap-2">
        <form action={approveEstimateAction} className="inline">
          <input type="hidden" name="estimateId" value={estimateId} />
          <Button
            type="submit"
            size="sm"
            className="rounded-lg bg-[#111827] text-white hover:bg-[#111827]/90"
          >
            Approve
          </Button>
        </form>
        <form action={rejectEstimateAction} className="inline">
          <input type="hidden" name="estimateId" value={estimateId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="rounded-lg border-destructive text-destructive hover:bg-destructive/10"
          >
            Reject
          </Button>
        </form>
      </div>
    );
  }

  if (s === "Approved") {
    return (
      <form action={convertToProjectAction} className="inline">
        <input type="hidden" name="estimateId" value={estimateId} />
        <Button type="submit" size="sm" variant="outline" className="rounded-lg">
          Convert to Project
        </Button>
      </form>
    );
  }

  return null;
}
