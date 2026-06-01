"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AddWorkerModal } from "./add-worker-modal";
import { Button } from "@/components/ui/button";

export function WorkersActions() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = (worker: { id: string }) => {
    syncRouterNonBlocking(router);
    router.push(`/workers/${encodeURIComponent(worker.id)}`);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 rounded-md border-[color:rgb(184_147_90_/_0.28)] bg-[rgb(184_147_90_/_0.10)] text-[13px] font-semibold text-[var(--neo-gold)] hover:bg-[rgb(184_147_90_/_0.16)] hover:text-[var(--neo-gold-soft)]"
        onClick={() => setModalOpen(true)}
      >
        Add Worker
      </Button>
      <AddWorkerModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={handleSuccess} />
    </>
  );
}
