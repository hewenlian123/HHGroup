"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AddBillModal } from "./add-bill-modal";

type Props = { projectId: string; subcontractId: string };

export function AddBillButton({ projectId, subcontractId }: Props) {
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
        + Add Bill
      </button>
      <AddBillModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
        projectId={projectId}
        subcontractId={subcontractId}
      />
    </>
  );
}
