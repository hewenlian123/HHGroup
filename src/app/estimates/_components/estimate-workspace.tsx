"use client";

import type { ReactNode } from "react";

import type { EstimateSummaryResult } from "@/lib/data";
import {
  EstimateBuilderCompactSummary,
  type EstimateBuilderPaymentSummary,
} from "./estimate-builder-summary";

/** One presentation for new drafts, saved estimates and item editing. Data stays with each owner. */
export function EstimateWorkspace({
  mode,
  summary,
  paymentSummary,
  onOpenDetails,
  onOpenPricing,
  details,
  payment,
  notes,
  children,
  empty = false,
}: {
  mode: "new" | "edit" | "read";
  summary: EstimateSummaryResult | null;
  paymentSummary?: EstimateBuilderPaymentSummary | null;
  onOpenDetails?: () => void;
  onOpenPricing?: () => void;
  details?: ReactNode;
  payment?: ReactNode;
  notes?: ReactNode;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div
      className="estimate-workspace eb-estimate-workbench eb-estimate-workbench--v3"
      data-canonical-estimate-workspace={mode}
    >
      {details}
      <EstimateBuilderCompactSummary
        summary={summary}
        paymentSummary={paymentSummary}
        onOpenDetails={onOpenDetails}
        onOpenPricing={onOpenPricing}
      />
      <div className="eb-v3-worksheet-flow">
        <div className="estimate-workspace-sheet">
          <header className="estimate-workspace-intro">
            <div>
              <h2>Scope of work statement</h2>
              <p>
                {empty
                  ? "Start with a section, then add the work you are estimating."
                  : "Included work, organized by section."}
              </p>
            </div>
            {onOpenDetails ? (
              <button type="button" onClick={onOpenDetails}>
                Estimate details
              </button>
            ) : null}
          </header>
          {children}
          {notes ? (
            <section
              id="estimate-customer-notes"
              className="estimate-workspace-notes"
              tabIndex={-1}
            >
              {notes}
            </section>
          ) : null}
          {payment ? (
            <section
              id="estimate-payment-schedule"
              className="estimate-workspace-payment-bottom"
              tabIndex={-1}
            >
              {payment}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
