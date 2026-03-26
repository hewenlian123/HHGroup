import { Suspense } from "react";
import LaborPageClient from "../labor-page-client";

export default function WorkerDailyEntryPage() {
  return (
    <Suspense fallback={<div className="page-container py-6">Loading…</div>}>
      <LaborPageClient />
    </Suspense>
  );
}
