"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddSubcontractorModal } from "./add-subcontractor-modal";

export function SubcontractorsActions() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => syncRouterNonBlocking(router);

  return (
    <>
      <Button
        type="button"
        onClick={() => setModalOpen(true)}
        size="sm"
        className="h-9 rounded-hh-compact"
      >
        Add Subcontractor
      </Button>
      <AddSubcontractorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}
