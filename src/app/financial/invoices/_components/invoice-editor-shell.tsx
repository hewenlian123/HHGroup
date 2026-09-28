"use client";

import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/formatters";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { contractBillingSummary } from "@/lib/financial/remaining-contract";
import { cn } from "@/lib/utils";
import type { InvoiceContractBilling } from "@/app/financial/invoices/_components/use-invoice-contract-billing";

export const invoiceEditorFieldClass =
  "mt-1.5 h-11 rounded-hh-standard border-[var(--hh-line-input)] bg-[var(--hh-surface)] px-3 text-[var(--hh-ink)]";

export const invoiceEditorLabelClass = "text-hh-label font-[650] uppercase text-[var(--hh-muted)]";

const cardClass =
  "overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] shadow-card";

export function InvoiceEditorShell({
  header,
  banner,
  parties,
  lines,
  notes,
  summary,
  history,
}: {
  header: React.ReactNode;
  banner?: React.ReactNode;
  parties: React.ReactNode;
  lines: React.ReactNode;
  notes: React.ReactNode;
  summary: React.ReactNode;
  history: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 pb-28 pt-5 text-[var(--hh-text)] sm:px-6 lg:gap-6 lg:px-10 lg:pb-16 lg:pt-7">
      <div data-page-header="true">{header}</div>
      {banner}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_352px] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          {parties}
          {lines}
          {notes}
        </div>
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4">
          {summary}
          {history}
        </div>
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  emphasis,
  testId,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={emphasis ? "font-medium text-[var(--hh-ink)]" : "text-[var(--hh-text)]"}>
        {label}
      </span>
      <span
        data-testid={testId}
        className={cn(
          "tabular-nums",
          emphasis ? "font-medium text-[var(--hh-ink)]" : "text-[var(--hh-ink-2)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function InvoiceEditorSummary({
  subtotal,
  taxAmount,
  total,
  billing,
  thisInvoiceExTax,
  taxControl,
  alert,
  actions,
}: {
  subtotal: number;
  taxAmount: number;
  total: number;
  billing: InvoiceContractBilling;
  thisInvoiceExTax: number;
  taxControl: React.ReactNode;
  alert?: string | null;
  actions: React.ReactNode;
}) {
  const contract =
    billing.status === "ready"
      ? contractBillingSummary({
          originalContract: billing.originalContract,
          approvedChangeOrders: billing.approvedChangeOrders,
          previouslyInvoicedExcludingTax: billing.previouslyInvoicedExcludingTax,
          thisInvoiceExcludingTax: thisInvoiceExTax,
        })
      : null;

  return (
    <section className={cn(cardClass, "p-4 sm:p-5")} aria-label="Invoice summary">
      <h2 className="text-title-card text-[var(--hh-ink)]">Summary</h2>
      <p className="mt-0.5 text-hh-metadata text-[var(--hh-muted)]">
        Tax is calculated on the subtotal. Discount is not stored on invoices.
      </p>

      <div className="mt-4 space-y-2.5 text-hh-body">
        <MoneyRow label="Subtotal" value={formatOverviewMoney(subtotal)} />
        <div className="flex items-center justify-between gap-3 text-[var(--hh-muted)]">
          <span>Discount</span>
          <span className="text-right text-hh-metadata">Not stored on invoices</span>
        </div>
        <MoneyRow label="Taxable amount" value={formatOverviewMoney(subtotal)} />
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">{taxControl}</div>
          <span className="pb-2 tabular-nums text-[var(--hh-ink-2)]">
            {formatOverviewMoney(taxAmount)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-[var(--hh-line)] pt-3">
          <span className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
            Total due
          </span>
          <span
            data-testid="invoice-editor-total-due"
            className="text-num-xl tabular-nums text-[var(--hh-ink)]"
          >
            {formatOverviewMoney(total)}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-hh-standard bg-[var(--hh-surface-sunken)] p-3">
        <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
          Contract billing
        </p>
        {billing.status === "loading" ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-full bg-[var(--hh-chip)]" />
            <Skeleton className="h-3 w-2/3 bg-[var(--hh-chip)]" />
            <Skeleton className="h-8 w-1/2 bg-[var(--hh-chip)]" />
          </div>
        ) : null}
        {billing.status === "idle" ? (
          <p className="mt-2 text-hh-metadata text-[var(--hh-muted)]">
            Select a project to calculate the remaining contract.
          </p>
        ) : null}
        {billing.status === "unavailable" ? (
          <p className="mt-2 text-hh-metadata font-medium text-[var(--hh-danger)]">
            Contract billing is unavailable.
          </p>
        ) : null}
        {contract ? (
          <div className="mt-3 space-y-2 text-hh-body">
            <MoneyRow
              label="Previously billed"
              value={formatOverviewMoney(contract.previouslyInvoicedExcludingTax)}
            />
            <MoneyRow
              label="This invoice"
              value={formatOverviewMoney(contract.thisInvoiceExcludingTax)}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-[var(--hh-ink)]">
                Billed to date
                {contract.billedToDatePercent != null ? ` · ${contract.billedToDatePercent}%` : ""}
              </span>
              <span className="tabular-nums font-medium text-[var(--hh-ink)]">
                {formatOverviewMoney(contract.billedToDateExcludingTax)}
              </span>
            </div>
            {contract.billedToDatePercent != null ? (
              <div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[var(--hh-track)]"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, contract.billedToDatePercent))}
                  aria-label={`Billed to date ${contract.billedToDatePercent} percent of the revised contract, excluding tax`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--hh-navy)]"
                    style={{
                      width: `${Math.min(100, Math.max(0, contract.billedToDatePercent))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line)] pt-2">
              <span className="font-medium text-[var(--hh-ink)]">Remaining contract</span>
              <span
                data-testid="invoice-remaining-contract"
                className={cn(
                  "text-num-m tabular-nums",
                  contract.remainingContract < 0
                    ? "text-[var(--hh-danger)]"
                    : "text-[var(--hh-ink)]"
                )}
              >
                {formatOverviewMoney(contract.remainingContract)}
              </span>
            </div>
            <p className="text-hh-metadata leading-5 text-[var(--hh-muted)]">
              Revised contract {formatOverviewMoney(contract.revisedContract)} · incl.{" "}
              {formatOverviewMoney(billing.status === "ready" ? billing.approvedChangeOrders : 0, {
                sign: "always",
              })}{" "}
              approved change orders. Excludes tax.
            </p>
          </div>
        ) : null}
      </div>

      {alert ? (
        <p
          className="invoice-new-error-text mt-3 text-hh-metadata font-medium text-[var(--hh-danger)]"
          role="alert"
        >
          {alert}
        </p>
      ) : null}

      <div className="invoice-new-action-footer mt-4 flex flex-col gap-2">{actions}</div>
    </section>
  );
}

function historyVariant(
  status: string
): "success" | "warning" | "danger" | "information" | "neutral" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "paid") return "success";
  if (normalized === "partially paid" || normalized === "overdue") return "warning";
  if (normalized === "void" || normalized === "voided") return "danger";
  if (normalized === "sent") return "information";
  return "neutral";
}

export function InvoiceBillingHistory({
  billing,
  currentInvoiceId,
}: {
  billing: InvoiceContractBilling;
  currentInvoiceId?: string | null;
}) {
  return (
    <section className={cardClass} aria-label="Billing history">
      <header className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <h2 className="text-title-card text-[var(--hh-ink)]">Billing history</h2>
      </header>
      {billing.status === "loading" ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          <Skeleton className="h-10 w-full bg-[var(--hh-chip)]" />
          <Skeleton className="h-10 w-full bg-[var(--hh-chip)]" />
        </div>
      ) : null}
      {billing.status === "idle" ? (
        <p className="px-4 pb-4 text-hh-metadata text-[var(--hh-muted)] sm:px-5">
          Select a project to see its invoices.
        </p>
      ) : null}
      {billing.status === "unavailable" ? (
        <p className="px-4 pb-4 text-hh-metadata font-medium text-[var(--hh-danger)] sm:px-5">
          Billing history is unavailable.
        </p>
      ) : null}
      {billing.status === "ready" && billing.history.length === 0 ? (
        <p className="px-4 pb-4 text-hh-metadata text-[var(--hh-muted)] sm:px-5">
          No invoices on this project yet.
        </p>
      ) : null}
      {billing.status === "ready" && billing.history.length > 0 ? (
        <ul className="max-h-80 divide-y divide-[var(--hh-line-2)] overflow-y-auto border-t border-[var(--hh-line-2)]">
          {billing.history.map((row) => {
            const current = row.id === currentInvoiceId;
            return (
              <li key={row.id}>
                <Link
                  href={`/financial/invoices/${row.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-hh-body font-semibold text-[var(--hh-ink)]">
                      {row.invoiceNo}
                      {current ? " · this invoice" : ""}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-hh-metadata text-[var(--hh-muted)]">
                        {row.issueDate ? formatDate(row.issueDate, "compact") : "No issue date"}
                      </span>
                      <Badge variant={historyVariant(row.status)}>{row.status}</Badge>
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-hh-body font-medium text-[var(--hh-ink)]">
                    {formatOverviewMoney(row.total)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
