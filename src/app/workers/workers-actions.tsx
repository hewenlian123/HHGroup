"use client";

import * as React from "react";
import { AddWorkerModal } from "./add-worker-modal";
import { Button } from "@/components/ui/button";

const workerCenterPrimaryAction =
  "h-10 rounded-[0.625rem] border border-[rgb(198_165_106_/_0.28)] bg-[var(--neo-gold)] px-3 text-[13px] font-semibold text-zinc-950 shadow-sm hover:bg-[var(--neo-gold-soft)] hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";

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
