"use client";

import * as React from "react";
import { AddWorkerModal } from "./add-worker-modal";
import { Button } from "@/components/ui/button";

const workerCenterPrimaryAction =
  "h-10 rounded-hh-standard border border-transparent bg-[var(--hh-action-primary)] px-3 text-hh-control text-[var(--hh-action-primary-foreground)] shadow-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

export function WorkersActions() {
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => undefined;

  return (
    <>
      <Button size="sm" className={workerCenterPrimaryAction} onClick={() => setModalOpen(true)}>
        Add Worker
      </Button>
      <AddWorkerModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={handleSuccess} />
    </>
  );
}
