"use client";
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/system-state";

// The existing Payroll UI includes browser-only payment modules. Keep its
// prerender boundary local, as with WorkerInvoicesClientIsland.
export const PayrollWorkspaceClient = dynamic(() => import("@/app/labor/payroll/page"), {
  ssr: false,
  loading: () => (
    <div className="page-container py-6" data-labor-read-state>
      <LoadingState text="Loading payroll summary…" />
    </div>
  ),
});
