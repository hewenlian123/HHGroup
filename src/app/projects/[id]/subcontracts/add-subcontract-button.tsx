"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AddSubcontractModal } from "./add-subcontract-modal";

type Subcontractor = { id: string; name: string };

type Props = { projectId: string; subcontractors: Subcontractor[] };

export function AddSubcontractButton({ projectId, subcontractors }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => router.refresh();

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
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
