import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import {
  KpiTile,
  NeoAmount,
  NeoPanel,
  NeoStatus,
  NeoTable,
  PageHeader,
  PageLayout,
  neoFormErrorClassName,
  neoFormNoticeClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { tableRawThClass } from "@/components/ui/table";
import { getProjectFinancialReview } from "@/lib/financial/project-financial-review-db";
import { cn } from "@/lib/utils";

function money(value: number | null): string {
  if (value == null) return "Not visible";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default async function ProjectFinancialReviewPage() {
  let payload: Awaited<ReturnType<typeof getProjectFinancialReview>> | null = null;
  let errorMessage: string | null = null;

  try {
    payload = await getProjectFinancialReview();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Project financial review could not be loaded.";
  }

  const rows = payload?.flaggedProjects ?? [];

  return (
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Project Financial Review"
          description="Internal contract-value cleanup list for projects where confirmed profit should stay guarded."
          actions={
            <Button asChild variant="outline" size="sm" className="h-9 rounded-hh-compact">
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
      }
    >
      {errorMessage ? <div className={neoFormErrorClassName}>{errorMessage}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Review summary">
        {[
          ["Flagged", payload?.summary.flaggedProjects ?? 0],
          ["$1 placeholders", payload?.summary.placeholder ?? 0],
          ["$0 contracts", payload?.summary.zero ?? 0],
          ["Suspicious huge", payload?.summary.suspiciousHuge ?? 0],
          ["Mismatches", payload?.summary.mismatch ?? 0],
        ].map(([label, value]) => (
          <KpiTile key={label} label={label} value={value} className="min-h-[92px]" />
        ))}
      </section>

      <NeoPanel
        title="Projects needing review"
        description="Read-only list. Use each project detail link to review context before editing values."
        action={
          payload ? (
            <p className="text-sm text-[var(--hh-text-secondary)]">
              {rows.length} of {payload.summary.totalProjects} projects flagged
            </p>
          ) : null
        }
      >
        {rows.length === 0 && !errorMessage ? (
          <div className={cn(neoFormNoticeClassName, "m-4 flex items-center gap-2")}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            No contract value cleanup items found.
          </div>
        ) : null}

        {rows.length > 0 ? (
          <NeoTable className="rounded-none border-0 shadow-none" tableClassName="min-w-[980px]">
            <thead>
              <tr>
                <th className={tableRawThClass}>Project</th>
                <th className={tableRawThClass}>Status</th>
                <th className={cn(tableRawThClass, "text-right")}>Contract / Budget</th>
                <th className={cn(tableRawThClass, "text-right")}>Actual Cost</th>
                <th className={tableRawThClass}>Profit Status</th>
                <th className={tableRawThClass}>Issue Reason</th>
                <th className={cn(tableRawThClass, "text-right")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <div className="min-w-[180px]">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">Budget {money(row.budget)}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <NeoStatus label={statusLabel(row.status)} variant="default" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <NeoAmount>{money(row.currentContractValue)}</NeoAmount>
                    {row.contractAmount != null && row.budget != null ? (
                      <p className="text-xs text-muted-foreground">
                        Contract {money(row.contractAmount)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <NeoAmount>{money(row.actualCost)}</NeoAmount>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-hh-compact px-2 py-1 text-hh-status font-medium",
                        row.confirmedProfitStatus === "needs_review"
                          ? "border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]"
                          : "border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"
                      )}
                    >
                      {row.confirmedProfitStatus === "needs_review" ? (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Needs review
                        </>
                      ) : (
                        "Ready"
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {row.issues.map((issue) => (
                        <span
                          key={issue.code}
                          className="rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-2 py-1 text-hh-status text-[var(--hh-text-secondary)]"
                        >
                          {issue.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button asChild variant="ghost" size="sm" className="h-8 rounded-hh-compact">
                      <Link href={row.detailHref} aria-label={`Open ${row.name}`}>
                        Open
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        ) : null}
      </NeoPanel>
    </PageLayout>
  );
}
