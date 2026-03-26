"use client";

import * as React from "react";
import { AddDailyEntryModal } from "@/app/labor/add-daily-entry-modal";
import { dispatchClientDataSync } from "@/lib/sync-router-client";

export default function WorkerDailyEntryPage() {
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
          dispatchClientDataSync({ reason: "worker-daily-entry-created" });
        }}
      />
    </div>
  );
}
