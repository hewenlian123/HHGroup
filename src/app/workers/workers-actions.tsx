"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AddWorkerModal } from "./add-worker-modal";
import { Button } from "@/components/ui/button";

export function WorkersActions() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => router.refresh();

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setModalOpen(true)}>
        Add Worker
      </Button>
      <AddWorkerModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={handleSuccess} />
    </>
  );
}
