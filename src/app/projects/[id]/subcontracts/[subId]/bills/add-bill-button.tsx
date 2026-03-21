"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AddBillModal } from "./add-bill-modal";

type Props = { projectId: string; subcontractId: string };

export function AddBillButton({ projectId, subcontractId }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => void syncRouterAndClients(router);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
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
