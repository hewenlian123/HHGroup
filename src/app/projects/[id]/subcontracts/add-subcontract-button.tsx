"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AddSubcontractModal } from "./add-subcontract-modal";

type Subcontractor = { id: string; name: string };

type Props = { projectId: string; subcontractors: Subcontractor[] };

export function AddSubcontractButton({ projectId, subcontractors }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => syncRouterNonBlocking(router);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex min-h-[44px] items-center rounded-hh-standard border border-input bg-transparent px-3 text-hh-body hover:bg-accent hover:text-accent-foreground xl:min-h-9"
      >
        + Add Subcontract
      </button>
      <AddSubcontractModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
        projectId={projectId}
        subcontractors={subcontractors}
      />
    </>
  );
}
