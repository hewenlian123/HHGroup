"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RecordPaymentModal } from "./record-payment-modal";

type Props = { workerId: string };

export function RecordPaymentButton({ workerId }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSuccess = () => {
    syncRouterNonBlocking(router);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        Record Payment
      </button>
      <RecordPaymentModal
        open={open}
        onOpenChange={setOpen}
        workerId={workerId}
        onSuccess={handleSuccess}
      />
    </>
  );
}
