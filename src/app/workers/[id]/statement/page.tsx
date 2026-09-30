import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { PageLayout, PageHeader } from "@/components/base";
import { sectionCardClass } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getLaborEntriesWithJoins, getLaborPaymentsByWorkerId } from "@/lib/daily-labor-db";
import { getWorkerByIdWithClient } from "@/lib/labor-db";
import { getWorkerAdvances } from "@/lib/worker-advances-db";
import { getWorkerPaymentsWithClient } from "@/lib/worker-payments-db";
import { getWorkerReimbursementsByWorkerId } from "@/lib/worker-reimbursements-db";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import {
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import { cn } from "@/lib/utils";
import { safeWorkerReturnPath, workerDetailReturnPath } from "@/lib/worker-return-path";

function formatMoney(n: number): string {
  const clean = Math.abs(n) < 0.005 ? 0 : n;
  const abs = Math.abs(clean).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return clean < 0 ? `-$${abs}` : `$${abs}`;
}

function formatDateLabel(value: string | null | undefined): string {
  const ymd = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildPeriodLabel(dates: string[]): string {
  const normalized = dates
    .map((date) => date.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (normalized.length === 0) return "All available activity";
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first === last) return formatDateLabel(first);
  return `${formatDateLabel(first)} to ${formatDateLabel(last)}`;
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
};
type StatementPaymentRow = {
  id: string;
  paymentDate: string;
  method: string | null;
  amount: number;
  note: string | null;
};

function SummaryCard({
  label,
  value,
  meta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  meta?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "min-h-[86px] px-4 py-3",
        sectionCardClass,
        tone === "success" && "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)]",
        tone === "danger" && "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
      )}
    >
      <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-hh-financial font-semibold leading-none tabular-nums text-[var(--hh-ink)]",
          tone === "success" && "text-[var(--hh-success)]",
          tone === "danger" && "text-[var(--hh-danger)]"
        )}
      >
        {value}
      </p>
      {meta ? (
        <p className="mt-2 truncate text-hh-metadata text-[var(--hh-muted)]">{meta}</p>
      ) : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-[var(--hh-line)] bg-[var(--hh-surface)] px-4 py-8 text-center text-sm text-[var(--hh-muted)]">
      {children}
    </div>
  );
}

export default async function WorkerStatementPage({ params, searchParams }: Props) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const qs = (await searchParams) ?? {};
  const returnHref = safeWorkerReturnPath(qs.returnTo, workerDetailReturnPath(id, "statements"));
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return (
      <ServerDataLoadFallback
        message={SUPABASE_MISSING_SERVER_ENV_MESSAGE}
        backHref={`/workers/${id}`}
        backLabel="Back to worker"
      />
    );
  }

  let worker: Awaited<ReturnType<typeof getWorkerByIdWithClient>>;
  let entries: Awaited<ReturnType<typeof getLaborEntriesWithJoins>> = [];
  let workerPayments: Awaited<ReturnType<typeof getWorkerPaymentsWithClient>> = [];
  let legacyPayments: Awaited<ReturnType<typeof getLaborPaymentsByWorkerId>> = [];
  let reimbursements: Awaited<ReturnType<typeof getWorkerReimbursementsByWorkerId>> = [];
  let advances: Awaited<ReturnType<typeof getWorkerAdvances>> = [];
  try {
    [worker, entries, workerPayments, legacyPayments, reimbursements, advances] = await Promise.all(
      [
        getWorkerByIdWithClient(supabase, id),
        getLaborEntriesWithJoins({ worker_id: id }, supabase),
        getWorkerPaymentsWithClient(supabase, { workerId: id }),
        getLaborPaymentsByWorkerId(id, supabase),
        getWorkerReimbursementsByWorkerId(id, supabase),
        getWorkerAdvances({ workerId: id }, supabase),
      ]
    );
  } catch (e) {
    logServerPageDataError(`workers/${id}/statement`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "worker statement")}
        backHref={`/workers/${id}`}
        backLabel="Back to worker"
      />
    );
  }

  if (!worker) notFound();

  const entryAmount = (entry: (typeof entries)[number]) =>
    Number(entry.labor_cost_snapshot ?? entry.amount_snapshot ?? entry.cost_amount) || 0;
  const totalEarned = entries.reduce((s, e) => s + entryAmount(e), 0);
  const paymentRows: StatementPaymentRow[] =
    workerPayments.length > 0
      ? workerPayments.map((payment) => ({
          id: payment.id,
          paymentDate: payment.paymentDate,
          method: payment.paymentMethod,
          amount: payment.amount,
          note: payment.notes,
        }))
      : legacyPayments.map((payment) => ({
          id: payment.id,
          paymentDate: payment.payment_date,
          method: payment.method,
          amount: payment.amount,
          note: null,
        }));
  const reimbursementTotal = reimbursements.reduce(
    (sum, row) => sum + Math.max(0, Number(row.amount) || 0),
    0
  );
  const advanceTotal = advances
    .filter((row) => String(row.status).toLowerCase() !== "cancelled")
    .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
  const cashPaid = paymentRows.reduce((s, p) => s + p.amount, 0);
  const totalOwed = totalEarned + reimbursementTotal;
  const balance = totalOwed - cashPaid - advanceTotal;
  const periodLabel = buildPeriodLabel([
    ...entries.map((entry) => entry.work_date),
    ...reimbursements.map((row) => row.reimbursementDate || row.createdAt),
    ...advances.map((row) => row.advanceDate),
    ...paymentRows.map((row) => row.paymentDate),
  ]);
  const balanceTone = balance > 0.005 ? "danger" : "success";

  return (
    <PageLayout
      frame="list"
      divider={false}
      className="financial-nums min-w-0 overflow-x-hidden"
      header={
        <PageHeader
          variant="workspace"
          title="Worker Statement"
          description={
            <span>
              {worker.name} · Statement period: <span className="tabular-nums">{periodLabel}</span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={returnHref}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 min-h-[44px] rounded-hh-standard px-4 text-hh-body font-semibold lg:h-10 lg:min-h-10"
                >
                  Back to Worker
                </Button>
              </Link>
              <Link href="/workers">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 min-h-[44px] rounded-hh-standard px-4 text-hh-body font-semibold lg:h-10 lg:min-h-10"
                >
                  All workers
                </Button>
              </Link>
            </div>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={worker.name} />

      <section className={cn(sectionCardClass, "px-4 py-4 md:px-5")}>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
              Statement
            </p>
            <h2 className="mt-1 truncate text-hh-section-title font-semibold leading-tight text-[var(--hh-ink)]">
              {worker.name}
            </h2>
            <p className="mt-1 text-hh-body leading-snug text-[var(--hh-muted)]">
              Snapshot-based labor, reimbursements, advance deductions, and cash payments.
            </p>
          </div>
          <div
            className={cn(
              "rounded-card border px-3 py-2 text-right",
              balanceTone === "success"
                ? "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)]"
                : "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]"
            )}
          >
            <p className="text-hh-status font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
              Balance
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                balanceTone === "success" ? "text-[var(--hh-success)]" : "text-[var(--hh-danger)]"
              )}
            >
              {formatMoney(balance)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryCard label="Earned" value={formatMoney(totalEarned)} meta="Labor snapshots" />
        <SummaryCard label="Reimbursements" value={formatMoney(reimbursementTotal)} />
        <SummaryCard
          label="Advance deductions"
          value={formatMoney(advanceTotal)}
          meta="Settled separately"
        />
        <SummaryCard label="Cash paid" value={formatMoney(cashPaid)} />
        <SummaryCard
          label="Balance"
          value={formatMoney(balance)}
          tone={balanceTone}
          meta={balance > 0.005 ? "Open amount" : "Settled"}
        />
      </section>

      <section className={sectionCardClass}>
        <header className="border-b border-[var(--hh-border)] px-4 py-3 md:px-5">
          <p className="text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Earnings
          </p>
          <p className="mt-1 text-hh-body text-[var(--hh-muted)]">
            Labor rows show saved snapshot amounts as recorded.
          </p>
        </header>
        <div className="hidden md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Project
                </th>
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Cost Code
                </th>
                <th className="px-4 py-2 text-right text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)] tabular-nums">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState>No earnings yet.</EmptyState>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--hh-border)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--hh-l3-hover)]"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-hh-metadata tabular-nums text-[var(--hh-text-secondary)]">
                      {formatDateLabel(entry.work_date)}
                    </td>
                    <td className="px-4 py-2.5 text-hh-body font-medium text-[var(--hh-ink)]">
                      {entry.project_name ?? "No project"}
                    </td>
                    <td className="px-4 py-2.5 text-hh-body text-[var(--hh-muted)]">
                      {entry.cost_code ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-hh-body font-semibold tabular-nums text-[var(--hh-ink)]">
                      {formatMoney(entryAmount(entry))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 p-3 md:hidden">
          {entries.length === 0 ? (
            <EmptyState>No earnings yet.</EmptyState>
          ) : (
            entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-hh-body font-semibold text-[var(--hh-ink)]">
                      {entry.project_name ?? "No project"}
                    </p>
                    <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                      {formatDateLabel(entry.work_date)}
                      {entry.cost_code ? ` · ${entry.cost_code}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-hh-financial font-semibold tabular-nums text-[var(--hh-ink)]">
                    {formatMoney(entryAmount(entry))}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className={sectionCardClass}>
        <header className="border-b border-[var(--hh-border)] px-4 py-3 md:px-5">
          <p className="text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
            Payments
          </p>
          <p className="mt-1 text-hh-body text-[var(--hh-muted)]">
            Cash payments only; advance deductions are summarized above.
          </p>
        </header>
        <div className="hidden md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Method
                </th>
                <th className="px-4 py-2 text-left text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)]">
                  Note
                </th>
                <th className="px-4 py-2 text-right text-hh-table-header font-semibold uppercase tracking-normal text-[var(--hh-muted)] tabular-nums">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8">
                    <EmptyState>No cash payments yet.</EmptyState>
                  </td>
                </tr>
              ) : (
                paymentRows.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-[var(--hh-border)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--hh-l3-hover)]"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-hh-metadata tabular-nums text-[var(--hh-text-secondary)]">
                      {formatDateLabel(payment.paymentDate)}
                    </td>
                    <td className="px-4 py-2.5 text-hh-body font-medium text-[var(--hh-ink)]">
                      {payment.method ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-hh-body text-[var(--hh-muted)]">
                      {payment.note ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-hh-body font-semibold tabular-nums text-[var(--hh-ink)]">
                      {formatMoney(payment.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 p-3 md:hidden">
          {paymentRows.length === 0 ? (
            <EmptyState>No cash payments yet.</EmptyState>
          ) : (
            paymentRows.map((payment) => (
              <article
                key={payment.id}
                className="rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-hh-body font-semibold text-[var(--hh-ink)]">
                      {payment.method ?? "Payment"}
                    </p>
                    <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                      {formatDateLabel(payment.paymentDate)}
                    </p>
                    {payment.note ? (
                      <p className="mt-1 line-clamp-2 text-hh-metadata text-[var(--hh-muted)]">
                        {payment.note}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-hh-financial font-semibold tabular-nums text-[var(--hh-ink)]">
                    {formatMoney(payment.amount)}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </PageLayout>
  );
}
