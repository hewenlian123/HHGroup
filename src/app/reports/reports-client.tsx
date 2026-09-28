"use client";

import { useFinanceQueryState } from "@/hooks/use-finance-query-state";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { financePathWithReturn } from "@/lib/finance-navigation";
import { FinanceContextBack } from "@/components/financial/finance-context-back";
import { BillDetailLink, BillDetailSheet } from "@/components/financial/bill-detail-sheet";
import { BarChart3, CalendarDays, ClipboardList, Layers } from "lucide-react";
import {
  FilterToolbar,
  KpiTile,
  NeoAmount,
  NeoMobileCard,
  NeoPanel,
  NeoStatus,
  NeoTable,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate, formatDateRange, formatPercent } from "@/lib/formatters";
import type {
  AgingBucket,
  AgingBucketName,
  AgingRow,
  ProjectProfitabilityRow,
  ReportsData,
  ReportsTab,
  ReportsKpiKey,
} from "@/lib/reports-db";
import { OS, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

const TAB_LABELS: Record<ReportsTab, string> = {
  monthly: "Monthly Business Report",
  "project-profitability": "Project Profitability",
  "ar-aging": "AR Aging",
  "ap-aging": "AP Aging",
};

function formatSignedCurrency(value: number): string {
  if (Math.abs(value) < 0.005) return "$0.00";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatSignedPercent(value: number): string {
  if (Math.abs(value) < 0.005) return "0%";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatPercent(Math.abs(value), { maximumFractionDigits: 1 })}`;
}

function valueText(kind: "currency" | "percent" | "count", value: number): string {
  if (kind === "count") return String(value);
  return kind === "percent"
    ? formatPercent(value, { maximumFractionDigits: 1 })
    : formatCurrency(value);
}

function deltaText(
  kind: "currency" | "percent" | "count",
  delta: number,
  deltaPct: number | null
): string {
  if (kind === "count") return `Previous period ${delta >= 0 ? "+" : ""}${delta} records`;
  const amount = kind === "percent" ? formatSignedPercent(delta) : formatSignedCurrency(delta);
  const pct = deltaPct == null ? "new period" : formatSignedPercent(deltaPct);
  return `vs previous period ${amount} (${pct})`;
}

function amountTone(value: number): "income" | "expense" | "muted" {
  if (value > 0.005) return "income";
  if (value < -0.005) return "expense";
  return "muted";
}

function EmptyReportState({
  title,
  body,
  testId,
}: {
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn(OS.emptyState, "min-w-0")}>
      <Layers className="mx-auto h-8 w-8 text-[var(--hh-text-tertiary)]" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-[var(--hh-text-primary)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[var(--hh-text-secondary)]">
        {body}
      </p>
    </div>
  );
}

function ReportLink({ href, children }: { href: string; children: React.ReactNode }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const target = financePathWithReturn(href, `${pathname}?${params}`);
  return href.startsWith("/bills/") ? (
    <BillDetailLink className="underline" href={target}>
      {children}
    </BillDetailLink>
  ) : (
    <Link className="underline" href={target}>
      {children}
    </Link>
  );
}

function AgingCustomerLink({ row }: { row: AgingRow }) {
  const params = new URLSearchParams(useSearchParams().toString());
  if (!row.customerId) return <>{row.counterparty}</>;
  params.set("customerId", row.customerId);
  return <ReportLink href={`/reports?${params}`}>{row.counterparty}</ReportLink>;
}

function AgingRecordLink({ row }: { row: AgingRow }) {
  return (
    <ReportLink
      href={row.source === "Invoice" ? `/financial/invoices/${row.id}` : `/bills/${row.id}`}
    >
      {row.label}
    </ReportLink>
  );
}

function MetricRecords({ data }: { data: ReportsData }) {
  const [metric, setMetric] = useFinanceQueryState("metric", "");
  if (!(metric in data.records)) return null;
  const key = metric as ReportsKpiKey;
  const records = data.records[key];
  const kpi = data.monthly.kpis.find((k) => k.key === key)!;
  return (
    <NeoPanel
      title={`${kpi.label} records`}
      description={data.definitions[key]}
      bodyClassName="p-4"
    >
      <Button variant="outline" onClick={() => setMetric("")}>
        Close records
      </Button>
      {key.startsWith("project") && data.projectReviewWarning && (
        <p role="status">{data.projectReviewWarning}</p>
      )}
      <p className="my-3 text-sm">
        {key.startsWith("project")
          ? "Lifetime · contract review scope"
          : key === "billsAp" || key === "outstandingAr"
            ? "Current balance · all dates"
            : formatDateRange(data.range.start, data.range.end)}{" "}
        · {records.length} records · Total {valueText(kpi.kind, kpi.value)}
      </p>
      <ul className="divide-y divide-[var(--hh-border)]" data-testid="metric-records">
        {records.map((row) => (
          <li key={row.id} className="py-3" data-finance-record={row.id} tabIndex={-1}>
            <ReportLink href={row.href}>{row.label}</ReportLink>
            <p className="text-sm">
              {valueText(kpi.kind, row.amount)} · {row.date || "No date"} · {row.status} ·{" "}
              {row.source} · {row.projectId || "Unassigned project"}
            </p>
          </li>
        ))}
      </ul>
      {!records.length && <p>No matching records.</p>}
    </NeoPanel>
  );
}

function MonthlyReport({ data }: { data: ReportsData }) {
  const [, setMetric] = useFinanceQueryState("metric", "");
  const params = useSearchParams();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <FilterToolbar className="items-stretch md:items-end">
        <form
          action="/reports"
          className="grid w-full min-w-0 gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,150px)_minmax(0,150px)_auto] md:items-end"
        >
          <input type="hidden" name="tab" value="monthly" />
          {Array.from(params.entries())
            .filter(
              ([key]) =>
                !["tab", "period", "from", "to", "metric", "billDetail", "billPay"].includes(key)
            )
            .map(([key, value], index) => (
              <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
            ))}
          <label className="flex min-w-0 flex-col gap-1">
            <span className={TYPO.sectionLabel}>Period</span>
            <NativeSelect
              name="period"
              defaultValue={data.range.period}
              aria-label="Report period"
              className="min-h-11 md:min-h-10"
            >
              <option value="all-time">All Time</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="this-quarter">This Quarter</option>
              <option value="this-year">This Year</option>
              <option value="custom">Custom Date Range</option>
            </NativeSelect>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={TYPO.sectionLabel}>From</span>
            <input
              aria-label="Custom from date"
              className="neo-input min-h-11 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] md:min-h-10"
              type="date"
              name="from"
              defaultValue={data.range.start}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={TYPO.sectionLabel}>To</span>
            <input
              aria-label="Custom to date"
              className="neo-input min-h-11 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-sm text-[var(--hh-text-primary)] md:min-h-10"
              type="date"
              name="to"
              defaultValue={data.range.end}
            />
          </label>
          <Button type="submit" variant="outline" className="min-h-10">
            <CalendarDays className="mr-2 h-4 w-4" aria-hidden />
            Apply
          </Button>
        </form>
      </FilterToolbar>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.monthly.kpis.map((kpi) => (
          <button
            type="button"
            key={kpi.key}
            className="text-left"
            onClick={() => setMetric(kpi.key)}
            aria-label={`View ${kpi.label} records`}
          >
            <KpiTile
              label={kpi.label}
              value={valueText(kpi.kind, kpi.value)}
              meta={
                kpi.key.startsWith("project")
                  ? "Lifetime · independent of period"
                  : kpi.key === "billsAp" || kpi.key === "outstandingAr"
                    ? "Current · all dates"
                    : data.range.period === "all-time"
                      ? "All time"
                      : deltaText(kpi.kind, kpi.delta, kpi.deltaPct)
              }
              tone={kpi.tone}
            />
          </button>
        ))}
      </div>

      <MetricRecords data={data} />
      {!data.monthly.hasActivity ? (
        <EmptyReportState
          testId="monthly-report-empty-state"
          title="No report activity for this period."
          body="The selected period has no invoice, payment, expense, labor, subcontractor, or AP activity."
        />
      ) : null}
    </div>
  );
}

function ProjectMobileCard({ row }: { row: ProjectProfitabilityRow }) {
  return (
    <NeoMobileCard className="p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[var(--hh-text-primary)]">
            <ReportLink href={`/projects/${row.projectId}?tab=financial`}>{row.project}</ReportLink>
          </p>
          <p className="mt-1 truncate text-xs text-[var(--hh-text-secondary)]">{row.customer}</p>
        </div>
        <NeoStatus label={row.status} variant="default" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        {[
          ["Revised Contract", row.invoiceContractAmount],
          ["Collected", row.collected],
          ["Expenses", row.expenses],
          ["Labor", row.labor],
          ["Subs + Commission", row.billsSubcontractors],
          ["Total Cost", row.totalCost],
          ["Profit", row.profit],
          ["Open AR", row.openAr],
          ["Open AP", row.openAp],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className={TYPO.sectionLabel}>{label}</p>
            <p className="mt-1 truncate text-right tabular-nums text-[var(--hh-text-primary)]">
              {formatCurrency(Number(value))}
            </p>
          </div>
        ))}
        <div className="min-w-0">
          <p className={TYPO.sectionLabel}>Margin %</p>
          <p className="mt-1 text-right tabular-nums text-[var(--hh-text-primary)]">
            {formatPercent(row.marginPct, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>
    </NeoMobileCard>
  );
}

function ProjectProfitability({ rows }: { rows: ProjectProfitabilityRow[] }) {
  return (
    <div data-testid="project-profitability-content" className="min-w-0">
      {rows.length === 0 ? (
        <EmptyReportState
          title="No project profitability rows."
          body="Projects will appear here once existing invoices, payments, costs, or AP records are linked."
        />
      ) : (
        <>
          <div className="hidden min-w-0 md:block">
            <NeoTable scrollClassName="max-h-[620px]" tableClassName="min-w-[1320px]">
              <thead>
                <tr className="border-b border-[var(--hh-border)] text-left">
                  {[
                    "Project",
                    "Customer",
                    "Revised Contract Amount",
                    "Collected",
                    "Expenses",
                    "Labor",
                    "Bills / Subcontractors",
                    "Total Cost",
                    "Profit",
                    "Margin %",
                    "Open AR",
                    "Open AP",
                    "Status",
                  ].map((label) => (
                    <th
                      key={label}
                      className={cn(
                        "px-3 py-3",
                        TYPO.tableHeader,
                        label !== "Project" && label !== "Customer" && label !== "Status"
                          ? "text-right"
                          : "text-left"
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hh-border)]">
                {rows.map((row) => (
                  <tr key={row.projectId} className="hover:bg-[var(--hh-l3-hover)]">
                    <td className="max-w-[220px] px-3 py-3 text-sm font-semibold text-[var(--hh-text-primary)]">
                      <ReportLink href={`/projects/${row.projectId}?tab=financial`}>
                        {row.project}
                      </ReportLink>
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-sm text-[var(--hh-text-secondary)]">
                      <span className="line-clamp-2">{row.customer}</span>
                    </td>
                    {[
                      row.invoiceContractAmount,
                      row.collected,
                      row.expenses,
                      row.labor,
                      row.billsSubcontractors,
                      row.totalCost,
                      row.profit,
                    ].map((value, index) => (
                      <td key={index} className="px-3 py-3 text-right text-sm tabular-nums">
                        <NeoAmount tone={index === 6 ? amountTone(value) : "neutral"}>
                          {formatCurrency(value)}
                        </NeoAmount>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {formatPercent(row.marginPct, { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {formatCurrency(row.openAr)}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {formatCurrency(row.openAp)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <NeoStatus label={row.status} variant="default" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <ProjectMobileCard key={row.projectId} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function bucketTestId(prefix: "ar-aging-bucket" | "ap-aging-bucket", bucket: AgingBucketName) {
  return `${prefix}-${bucket}`;
}

function AgingBucketGrid({
  buckets,
  prefix,
}: {
  buckets: AgingBucket[];
  prefix: "ar-aging-bucket" | "ap-aging-bucket";
}) {
  const [, setBucket] = useFinanceQueryState(prefix, "");
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {buckets.map((bucket) => (
        <button
          type="button"
          onClick={() => setBucket(bucket.bucket)}
          key={bucket.bucket}
          data-testid={bucketTestId(prefix, bucket.bucket)}
          className={cn(OS.card, "min-w-0 px-3 py-3")}
        >
          <p className={TYPO.kpiLabel}>{bucket.bucket}</p>
          <p className="mt-2 truncate text-lg font-semibold tabular-nums text-[var(--hh-text-primary)]">
            {formatCurrency(bucket.amount)}
          </p>
          <p className={cn(TYPO.kpiSubtitle, "mt-2")}>
            {bucket.count === 1 ? "1 item" : `${bucket.count} items`}
          </p>
        </button>
      ))}
    </div>
  );
}

function AgingMobileCard({ row }: { row: AgingRow }) {
  return (
    <NeoMobileCard className="p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[var(--hh-text-primary)]">
            <AgingRecordLink row={row} />
          </p>
          <p className="mt-1 truncate text-xs text-[var(--hh-text-secondary)]">
            <AgingCustomerLink row={row} /> · {row.project}
          </p>
        </div>
        <NeoStatus label={row.bucket} variant={row.bucket === "Current" ? "success" : "warning"} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={TYPO.sectionLabel}>Due</p>
          <p className="mt-1 text-xs text-[var(--hh-text-secondary)]">{formatDate(row.dueDate)}</p>
        </div>
        <p className="text-right text-sm font-semibold tabular-nums text-[var(--hh-text-primary)]">
          {formatCurrency(row.amount)}
        </p>
      </div>
    </NeoMobileCard>
  );
}

function AgingTable({ rows }: { rows: AgingRow[] }) {
  return (
    <>
      <div className="hidden min-w-0 md:block">
        <NeoTable tableClassName="min-w-[980px]">
          <thead>
            <tr className="border-b border-[var(--hh-border)]">
              {["Item", "Counterparty", "Project", "Due Date", "Bucket", "Source", "Balance"].map(
                (label) => (
                  <th
                    key={label}
                    className={cn(
                      "px-3 py-3 text-left",
                      TYPO.tableHeader,
                      label === "Balance" && "text-right"
                    )}
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hh-border)]">
            {rows.map((row) => (
              <tr key={`${row.source}-${row.id}`} className="hover:bg-[var(--hh-l3-hover)]">
                <td className="max-w-[220px] px-3 py-3 text-sm font-semibold text-[var(--hh-text-primary)]">
                  <AgingRecordLink row={row} />
                </td>
                <td className="px-3 py-3 text-sm text-[var(--hh-text-secondary)]">
                  <AgingCustomerLink row={row} />
                </td>
                <td className="max-w-[220px] px-3 py-3 text-sm text-[var(--hh-text-secondary)]">
                  <span className="line-clamp-2">{row.project}</span>
                </td>
                <td className="px-3 py-3 text-sm tabular-nums text-[var(--hh-text-secondary)]">
                  {formatDate(row.dueDate)}
                </td>
                <td className="px-3 py-3">
                  <NeoStatus
                    label={row.bucket}
                    variant={row.bucket === "Current" ? "success" : "warning"}
                  />
                </td>
                <td className="px-3 py-3 text-sm text-[var(--hh-text-secondary)]">{row.source}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums">
                  <NeoAmount>{formatCurrency(row.amount)}</NeoAmount>
                </td>
              </tr>
            ))}
          </tbody>
        </NeoTable>
      </div>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <AgingMobileCard key={`${row.source}-${row.id}`} row={row} />
        ))}
      </div>
    </>
  );
}

function AgingReport({
  title,
  description,
  buckets,
  rows,
  contentTestId,
  bucketPrefix,
}: {
  title: string;
  description: string;
  buckets: AgingBucket[];
  rows: AgingRow[];
  contentTestId: string;
  bucketPrefix: "ar-aging-bucket" | "ap-aging-bucket";
}) {
  const [bucket, setBucket] = useFinanceQueryState(bucketPrefix, "");
  const visibleRows = bucket ? rows.filter((row) => row.bucket === bucket) : rows;
  return (
    <div data-testid={contentTestId} className="flex min-w-0 flex-col gap-4">
      <NeoPanel eyebrow="Aging" title={title} description={description} bodyClassName="p-4">
        <AgingBucketGrid buckets={buckets} prefix={bucketPrefix} />
      </NeoPanel>
      {rows.length === 0 ? (
        <EmptyReportState
          title="No open balances."
          body="Aging buckets will populate when existing open AR, AP, subcontractor, or worker payable balances exist."
        />
      ) : (
        <>
          <Button variant="ghost" onClick={() => setBucket("")}>
            All aging records
          </Button>
          <p>
            {bucket || "All buckets"} ·{" "}
            {formatCurrency(visibleRows.reduce((n, row) => n + row.amount, 0))}
          </p>
          <AgingTable rows={visibleRows} />
        </>
      )}
    </div>
  );
}

export function ReportsClient({ data, activeTab }: { data: ReportsData; activeTab: ReportsTab }) {
  const [tab, setTab] = useFinanceQueryState<ReportsTab>("tab", activeTab);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Reports"
          description={`Operating analysis for ${formatDateRange(data.range.start, data.range.end)}.`}
          actions={
            <div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 text-sm text-[var(--hh-text-secondary)]">
              <BarChart3 className="h-4 w-4 text-[var(--hh-text-secondary)]" aria-hidden />
              <span className="truncate">{data.range.label}</span>
            </div>
          }
        />
      }
    >
      <FinanceContextBack />
      <BillDetailSheet />
      <p role="status" className="text-sm text-muted-foreground">
        Historical AR/AP: Unavailable with current data. Date filters select activity, not an as-of
        balance. Complete Cash In, Cash Out and Net Cash Flow remain unavailable; Collected Cash and
        AP Payments are separate recorded-payment subsets.
      </p>
      {data.warnings.length > 0 ? (
        <div className="rounded-hh-standard border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-4 py-3 text-hh-body text-[var(--hh-information)]">
          {data.warnings.join(" ")}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as ReportsTab)} className="min-w-0">
        <div className="min-w-0 overflow-x-auto pb-1">
          <TabsList className="min-w-max">
            {(Object.keys(TAB_LABELS) as ReportsTab[]).map((key) => (
              <TabsTrigger key={key} value={key}>
                {TAB_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="monthly">
          <NeoPanel
            eyebrow="Operating report"
            title="Monthly Business Report"
            description="Period activity and current AR/AP. Select a metric to inspect its definition and exact records."
            bodyClassName="p-4"
            action={
              <ClipboardList className="h-4 w-4 text-[var(--hh-text-tertiary)]" aria-hidden />
            }
          >
            <MonthlyReport data={data} />
          </NeoPanel>
        </TabsContent>

        <TabsContent value="project-profitability">
          <NeoPanel
            eyebrow="Project analysis"
            title="Project Profitability"
            description="Lifetime canonical contract profit, independent of the monthly period. Generic AP is excluded from cost; Subs + Commission includes both canonical cost components."
            bodyClassName="p-4"
          >
            {data.projectReviewWarning && <p role="status">{data.projectReviewWarning}</p>}
            <ProjectProfitability rows={data.projectProfitability.rows} />
          </NeoPanel>
        </TabsContent>

        <TabsContent value="ar-aging">
          <AgingReport
            title="AR Aging"
            description="Current invoice balances aged against today; all issue dates. Not a historical period-end balance."
            buckets={data.arAging.buckets}
            rows={data.arAging.rows}
            contentTestId="ar-aging-content"
            bucketPrefix="ar-aging-bucket"
          />
        </TabsContent>

        <TabsContent value="ap-aging">
          <AgingReport
            title="AP Aging"
            description="Current Pending / Partially Paid AP bills, aged against today; all issue dates. Worker, subcontract and legacy ledgers excluded."
            buckets={data.apAging.buckets}
            rows={data.apAging.rows}
            contentTestId="ap-aging-content"
            bucketPrefix="ap-aging-bucket"
          />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
