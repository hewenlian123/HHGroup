"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

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
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <NativeSelect
        aria-label="Report month"
        className="h-8 min-w-[10rem] rounded-sm text-sm"
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
      </NativeSelect>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-sm"
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
