"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NeoSelect } from "@/components/base";

const toolbarSelectClass =
  "h-9 min-w-[10rem] rounded-[0.625rem] border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[13px] text-[var(--neo-text-primary)] shadow-none hover:bg-[var(--neo-surface-muted)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-11 max-md:w-full";

const toolbarPrimaryButtonClass =
  "h-9 rounded-[0.625rem] border-transparent bg-[var(--neo-gold)] px-3 text-[13px] font-semibold text-zinc-950 shadow-none hover:bg-[var(--neo-gold-soft)] hover:text-zinc-950 focus-visible:ring-[var(--neo-gold-ring)] max-md:min-h-11 max-md:w-full";

function monthOptions(count = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const ym = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      value: ym,
      label: x.toLocaleString("en-US", { month: "short", year: "numeric" }),
    });
  }
  return out;
}

export function MonthReportToolbar({
  workerId,
  currentYm,
  printDocumentTitle,
}: {
  workerId: string;
  currentYm: string;
  /** Optional PDF / print job title (browser “Save as PDF” filename hint). */
  printDocumentTitle?: string;
}) {
  const router = useRouter();
  const opts = monthOptions();

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden max-md:w-full">
      <NeoSelect
        aria-label="Report month"
        className={toolbarSelectClass}
        value={currentYm}
        onChange={(e) => {
          const v = e.target.value;
          router.push(
            `/worker/${encodeURIComponent(workerId)}/monthly-report?month=${encodeURIComponent(v)}`
          );
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NeoSelect>
      <Button
        type="button"
        variant="default"
        size="sm"
        className={toolbarPrimaryButtonClass}
        onClick={() => {
          const prev = document.title;
          if (printDocumentTitle?.trim()) document.title = printDocumentTitle.trim();
          const restoreTitle = () => {
            document.title = prev;
            window.removeEventListener("afterprint", restoreTitle);
          };
          window.addEventListener("afterprint", restoreTitle);
          window.print();
        }}
      >
        Print / PDF
      </Button>
    </div>
  );
}
