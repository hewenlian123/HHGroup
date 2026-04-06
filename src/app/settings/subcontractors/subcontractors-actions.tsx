"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AddSubcontractorModal } from "./add-subcontractor-modal";

export function SubcontractorsActions() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => syncRouterNonBlocking(router);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        Add Subcontractor
      </button>
      <AddSubcontractorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
