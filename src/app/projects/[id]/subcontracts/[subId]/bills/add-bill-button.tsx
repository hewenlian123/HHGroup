"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddBillModal } from "./add-bill-modal";

type Props = { projectId: string; subcontractId: string };

export function AddBillButton({ projectId, subcontractId }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleSuccess = () => syncRouterNonBlocking(router);

  return (
    <>
      <Button type="button" className="min-h-[44px]" onClick={() => setModalOpen(true)}>
        Add Bill
      </Button>
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
