"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { ReceiptViewerMetadata as ReceiptViewerMetadataValue } from "./types";
import { cn } from "@/lib/utils";

type MetadataRow = {
  label: string;
  value: string;
};

function metadataRows(metadata: ReceiptViewerMetadataValue): MetadataRow[] {
  return [
    { label: "Merchant", value: metadata.merchant ?? "" },
    { label: "Date", value: metadata.expenseDate ?? "" },
    { label: "Amount", value: metadata.amount ?? "" },
    { label: "Project", value: metadata.project ?? "" },
    { label: "Category", value: metadata.category ?? "" },
    { label: "Source", value: metadata.paymentSource ?? "" },
    { label: "Status", value: metadata.status ?? "" },
    { label: "File", value: metadata.uploadFileName ?? "" },
  ].filter((row) => row.value.trim().length > 0);
}

function MetadataRows({ rows }: { rows: MetadataRow[] }) {
  return (
    <dl className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--neo-canvas-text-tertiary)]">
            {row.label}
          </dt>
          <dd
            className={cn(
              "mt-1 break-words text-sm leading-5 text-[var(--neo-canvas-text-primary)]",
              row.label === "Amount" && "font-semibold tabular-nums text-[var(--neo-gold-soft)]"
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ReceiptViewerMetadata({
  metadata,
  mobile = false,
}: {
  metadata: ReceiptViewerMetadataValue;
  mobile?: boolean;
}) {
  const rows = React.useMemo(() => metadataRows(metadata), [metadata]);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const mobilePanelId = React.useId();
  if (rows.length === 0) return null;

  if (mobile) {
    return (
      <div className="border-t border-white/10 bg-[rgb(24_27_30_/_0.96)]">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobilePanelId}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-[var(--neo-canvas-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--neo-gold-ring)]"
        >
          <span>Receipt details</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--neo-canvas-text-tertiary)] transition-transform duration-150 motion-reduce:transition-none",
              mobileOpen && "rotate-180"
            )}
            aria-hidden
          />
        </button>
        {mobileOpen ? (
          <div id={mobilePanelId} className="max-h-[34dvh] overflow-y-auto px-4 pb-4 pt-2">
            <MetadataRows rows={rows} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      aria-label="Receipt details"
      className="hidden min-h-0 overflow-y-auto border-l border-white/10 bg-[rgb(24_27_30_/_0.88)] px-5 py-5 lg:block"
    >
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--neo-canvas-text-tertiary)]">
        Receipt details
      </p>
      <MetadataRows rows={rows} />
    </aside>
  );
}
