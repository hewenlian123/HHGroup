import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Project Financial Review"
        subtitle="Internal contract-value cleanup list for projects where confirmed profit should stay guarded."
        actions={
          <Button asChild variant="outline" size="sm" className="h-9 rounded-sm">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />

      {errorMessage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Review summary">
        {[
          ["Flagged", payload?.summary.flaggedProjects ?? 0],
          ["$1 placeholders", payload?.summary.placeholder ?? 0],
          ["$0 contracts", payload?.summary.zero ?? 0],
          ["Suspicious huge", payload?.summary.suspiciousHuge ?? 0],
          ["Mismatches", payload?.summary.mismatch ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Projects needing review</h2>
            <p className="text-sm text-muted-foreground">
              Read-only list. Use each project detail link to review context before editing values.
            </p>
          </div>
          {payload ? (
            <p className="text-sm text-muted-foreground">
              {rows.length} of {payload.summary.totalProjects} projects flagged
            </p>
          ) : null}
        </div>

        {rows.length === 0 && !errorMessage ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            No contract value cleanup items found.
          </div>
        ) : null}

        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contract / Budget</TableHead>
                <TableHead className="text-right">Actual Cost</TableHead>
                <TableHead>Profit Status</TableHead>
                <TableHead>Issue Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="min-w-[180px]">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">Budget {money(row.budget)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-sm">
                      {statusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{money(row.currentContractValue)}</div>
                    {row.contractAmount != null && row.budget != null ? (
                      <p className="text-xs text-muted-foreground">
                        Contract {money(row.contractAmount)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.actualCost)}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium",
                        row.confirmedProfitStatus === "needs_review"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-800"
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
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {row.issues.map((issue) => (
                        <Badge key={issue.code} variant="secondary" className="rounded-sm">
                          {issue.label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm" className="h-8 rounded-sm">
                      <Link href={row.detailHref} aria-label={`Open ${row.name}`}>
                        Open
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </div>
  );
}
