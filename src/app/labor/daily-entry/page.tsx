"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AddDailyEntryModal } from "@/app/labor/add-daily-entry-modal";

export default function WorkerDailyEntryPage() {
  const router = useRouter();
  const [nonce, setNonce] = React.useState(0);

  return (
    <div className="min-h-screen bg-white px-3 py-4 sm:px-6">
      <AddDailyEntryModal
        key={nonce}
        open
        onOpenChange={() => {
          // Keep worker mode focused on a single, always-open entry form.
        }}
        onSuccess={() => {
          setNonce((n) => n + 1);
          router.refresh();
        }}
      />
    </div>
  );
}
