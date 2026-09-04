"use client";

import dynamic from "next/dynamic";

/**
 * The invoice workspace depends on browser-only UI/data modules that Next 14
 * cannot production-prerender. Keep that boundary local to this route.
 */
export const WorkerInvoicesClientIsland = dynamic(
  () => import("./worker-invoices-client").then((module) => module.WorkerInvoicesClient),
  { ssr: false }
);
