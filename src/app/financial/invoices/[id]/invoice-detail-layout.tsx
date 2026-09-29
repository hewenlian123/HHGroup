"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CircleDollarSign, Clock, Eye, Folder, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const cardClass =
  "overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] text-[var(--hh-text)] shadow-card";
const titleClass = "text-title-card text-[var(--hh-ink)]";
const metaClass = "mt-0.5 text-hh-metadata text-[var(--hh-muted)]";

export type InvoiceDetailPaymentRow = {
  id: string;
  dateLabel: string;
  method: string;
  reference: string;
  referenceDetail: string;
  amountLabel: string;
  balanceLabel: string;
  voided: boolean;
  issued: boolean;
};

export type InvoiceDetailLine = {
  key: string;
  description: string;
  qtyLabel: string;
  rateLabel: string;
  amountLabel: string;
};

export type InvoiceDetailActivityItem = {
  id: string;
  title: string;
  detail: string;
  dateLabel: string;
  tone: "payment" | "status" | "created";
};

export type InvoiceDetailContract =
  | { status: "loading" }
  | { status: "idle" }
  | { status: "unavailable" }
  | {
      status: "ready";
      percentLabel: string | null;
      priorWidth: number;
      thisWidth: number;
      originalLabel: string;
      approvedLabel: string;
      approvedCount: number;
      revisedLabel: string;
      billedLabel: string;
      billedCount: number;
      thisInvoiceLabel: string;
      remainingLabel: string;
      remainingNegative: boolean;
    };

export type InvoiceDetailBillTo = {
  customerName: string;
  customerHref: string | null;
  projectName: string;
  projectHref: string | null;
  projectDetail: string | null;
  address: string | null;
  viewHref: string | null;
};

type InvoiceDetailLayoutProps = {
  backHref: string;
  backLabel: string;
  backTestId?: string;
  invoiceNo: string;
  status: React.ReactNode;
  customer: React.ReactNode;
  project: React.ReactNode;
  customerProjectLabel: string;
  issuedLabel: string;
  dueLabel: string;
  moreMenu: React.ReactNode;
  desktopActions: React.ReactNode;
  mobilePrimary: React.ReactNode;
  previewHref: string;
  totalLabel: string;
  totalDetail: string | null;
  paidLabel: string;
  paidDetail: string;
  balanceLabel: string;
  outstandingLabel: string | null;
  dueValue: string;
  dueHint: string | null;
  dueHintWarn: boolean;
  paidPercent: number;
  paidProgressLabel: string;
  lineCountLabel: string;
  editInvoice: React.ReactNode;
  lines: InvoiceDetailLine[];
  lineFooter: React.ReactNode;
  paymentSummary: string;
  recordPayment: React.ReactNode;
  paymentRows: InvoiceDetailPaymentRow[];
  paymentFooterAmount: string;
  paymentFooterBalance: string;
  renderPaymentMenu: (row: InvoiceDetailPaymentRow) => React.ReactNode;
  deposits: Array<{ id: string; dateLabel: string; account: string; amountLabel: string }>;
  notes: string;
  editNotes: React.ReactNode;
  contract: InvoiceDetailContract;
  billTo: InvoiceDetailBillTo;
  activityTitle: string;
  nextActivity: string | null;
  activity: InvoiceDetailActivityItem[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function AmountStrip(props: InvoiceDetailLayoutProps) {
  const progress = (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[var(--hh-track)]"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={props.paidPercent}
      aria-label={props.paidProgressLabel}
    >
      <div
        className="h-full rounded-full bg-[image:var(--hh-grad-bar-navy)]"
        style={{ width: `${props.paidPercent}%` }}
      />
    </div>
  );

  return (
    <section
      className={cn(cardClass, "xl:grid xl:grid-cols-[1fr_1fr_1.18fr_1fr]")}
      aria-label="Invoice amounts"
    >
      <div className="grid grid-cols-2 gap-2.5 p-3 xl:contents">
        <div className="col-span-2 rounded-card bg-hero px-4 py-3.5 text-[var(--hh-sidebar-text-strong)] shadow-hero xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:rounded-none xl:px-5 xl:py-4 xl:shadow-none">
          <p className="text-hh-label font-[650] uppercase text-[var(--hh-sidebar-text-pin)]">
            Balance due
          </p>
          <p
            data-testid="invoice-detail-balance"
            className="mt-1 text-display-hero tabular-nums xl:text-num-xl"
          >
            {props.balanceLabel}
          </p>
          {props.outstandingLabel ? (
            <p className="mt-1 text-hh-metadata tabular-nums text-[var(--hh-sidebar-text-pin)]">
              {props.outstandingLabel}
            </p>
          ) : null}
          <div className="mt-3 xl:hidden">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--hh-sidebar-hover)]">
              <div
                className="h-full rounded-full bg-[image:var(--hh-grad-hero-bar)]"
                style={{ width: `${props.paidPercent}%` }}
              />
            </div>
            <p className="mt-2 text-hh-metadata tabular-nums text-[var(--hh-sidebar-text-pin)]">
              {props.paidProgressLabel}
            </p>
          </div>
        </div>
        <div className="rounded-card border border-[var(--hh-line)] px-3.5 py-3 xl:col-start-1 xl:row-start-1 xl:rounded-none xl:border-0 xl:border-r xl:border-[var(--hh-line-2)] xl:px-5 xl:py-4">
          <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">Invoice total</p>
          <p
            data-testid="invoice-detail-total"
            className="mt-1 text-num-l tabular-nums text-[var(--hh-ink)]"
          >
            {props.totalLabel}
          </p>
          {props.totalDetail ? (
            <p className="mt-1 text-hh-metadata tabular-nums text-[var(--hh-muted)]">
              {props.totalDetail}
            </p>
          ) : null}
        </div>
        <div className="rounded-card border border-[var(--hh-line)] px-3.5 py-3 xl:col-start-2 xl:row-start-1 xl:rounded-none xl:border-0 xl:border-r xl:border-[var(--hh-line-2)] xl:px-5 xl:py-4">
          <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">Paid</p>
          <p className="mt-1 text-num-l tabular-nums text-[var(--hh-ink)]">{props.paidLabel}</p>
          <p className="mt-1 text-hh-metadata tabular-nums text-[var(--hh-muted)]">
            {props.paidDetail}
          </p>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-card border border-[var(--hh-line)] px-3.5 py-3 xl:col-span-1 xl:col-start-4 xl:row-start-1 xl:block xl:rounded-none xl:border-0 xl:px-5 xl:py-4">
          <div>
            <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">Due date</p>
            <p className="mt-1 text-num-m tabular-nums text-[var(--hh-ink)] xl:text-num-l">
              {props.dueValue}
            </p>
          </div>
          {props.dueHint ? (
            <p
              className={cn(
                "flex items-center gap-1 text-hh-metadata font-semibold tabular-nums",
                props.dueHintWarn ? "text-[var(--hh-warning)]" : "text-[var(--hh-muted)]"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {props.dueHint}
            </p>
          ) : null}
        </div>
      </div>
      <div className="hidden items-center gap-4 border-t border-[var(--hh-line-2)] bg-[var(--hh-surface-sunken)] px-5 py-2.5 xl:col-span-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto]">
        {progress}
        <p className="text-hh-metadata tabular-nums text-[var(--hh-muted)]">
          {props.paidProgressLabel}
        </p>
      </div>
    </section>
  );
}

function ContractBody({
  contract,
  withTestId,
}: {
  contract: InvoiceDetailContract;
  withTestId: boolean;
}) {
  if (contract.status === "loading") {
    return (
      <p className="px-4 py-4 text-hh-metadata text-[var(--hh-muted)] sm:px-5">
        Loading contract billing…
      </p>
    );
  }
  if (contract.status === "idle") {
    return (
      <p className="px-4 py-4 text-hh-metadata text-[var(--hh-muted)] sm:px-5">
        This invoice is not linked to a project.
      </p>
    );
  }
  if (contract.status === "unavailable") {
    return (
      <p className="px-4 py-4 text-hh-metadata font-medium text-[var(--hh-danger)] sm:px-5">
        Contract billing is unavailable.
      </p>
    );
  }

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--hh-track)]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, contract.priorWidth + contract.thisWidth)}
        aria-label={
          contract.percentLabel
            ? `Billed to date ${contract.percentLabel} of the revised contract, excluding tax`
            : "Contract billing progress, excluding tax"
        }
      >
        <span
          className="h-full bg-[image:var(--hh-grad-bar-navy)]"
          style={{ width: `${contract.priorWidth}%` }}
        />
        <span
          className="h-full bg-[var(--hh-navy-mid)]"
          style={{ width: `${contract.thisWidth}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-hh-metadata text-[var(--hh-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-hh-standard bg-[var(--hh-navy)]" />
          Prior invoices
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-hh-standard bg-[var(--hh-navy-mid)]" />
          This invoice
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-hh-standard bg-[var(--hh-track)]" />
          Remaining
        </span>
      </div>
      <dl className="mt-2 text-hh-body">
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line-2)] py-1.5">
          <dt className="text-[var(--hh-text)]">Original contract</dt>
          <dd className="tabular-nums font-semibold text-[var(--hh-ink)]">
            {contract.originalLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line-2)] py-1.5">
          <dt className="text-[var(--hh-text)]">
            Approved change orders
            {contract.approvedCount > 0 ? (
              <span className="ml-1 text-hh-metadata text-[var(--hh-muted)]">
                {contract.approvedCount} CO{contract.approvedCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </dt>
          <dd className="tabular-nums font-semibold text-[var(--hh-ink)]">
            {contract.approvedLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line)] py-1.5">
          <dt className="font-semibold text-[var(--hh-ink)]">Revised contract</dt>
          <dd className="tabular-nums font-semibold text-[var(--hh-ink)]">
            {contract.revisedLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line-2)] py-1.5">
          <dt className="text-[var(--hh-text)]">
            Billed to date
            {contract.billedCount > 0 ? (
              <span className="ml-1 text-hh-metadata text-[var(--hh-muted)]">
                {contract.billedCount} invoice{contract.billedCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </dt>
          <dd className="tabular-nums font-semibold text-[var(--hh-ink)]">
            {contract.billedLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1">
          <dt className="pl-3 text-hh-metadata text-[var(--hh-muted)]">incl. this invoice</dt>
          <dd className="tabular-nums text-[var(--hh-text)]">{contract.thisInvoiceLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hh-line)] py-2">
          <dt className="font-semibold text-[var(--hh-ink)]">Remaining contract</dt>
          <dd
            data-testid={withTestId ? "invoice-remaining-contract" : undefined}
            className={cn(
              "text-num-m tabular-nums",
              contract.remainingNegative ? "text-[var(--hh-danger)]" : "text-[var(--hh-ink)]"
            )}
          >
            {contract.remainingLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BillToBody({ billTo }: { billTo: InvoiceDetailBillTo }) {
  return (
    <div className="px-4 py-1 sm:px-5">
      <div className="flex items-center gap-3 border-t border-[var(--hh-line-2)] py-2.5 first:border-t-0">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--hh-surface-sunken)] text-hh-metadata font-semibold text-[var(--hh-ink)]">
          {initials(billTo.customerName)}
        </span>
        <div className="min-w-0">
          {billTo.customerHref ? (
            <Link href={billTo.customerHref} className="font-semibold text-[var(--hh-link)]">
              {billTo.customerName}
            </Link>
          ) : (
            <p className="font-semibold text-[var(--hh-ink)]">{billTo.customerName}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--hh-line-2)] py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-hh-standard bg-[var(--hh-surface-sunken)] text-[var(--hh-link)]">
          <Folder className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {billTo.projectHref ? (
            <Link href={billTo.projectHref} className="font-semibold text-[var(--hh-link)]">
              {billTo.projectName}
            </Link>
          ) : (
            <p className="font-semibold text-[var(--hh-ink)]">{billTo.projectName}</p>
          )}
          {billTo.projectDetail ? (
            <p className="truncate text-hh-metadata text-[var(--hh-muted)]">
              {billTo.projectDetail}
            </p>
          ) : null}
        </div>
      </div>
      {billTo.address ? (
        <div className="flex items-center gap-3 border-t border-[var(--hh-line-2)] py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-hh-standard bg-[var(--hh-surface-sunken)] text-[var(--hh-link)]">
            <MapPin className="h-4 w-4" />
          </span>
          <p className="min-w-0 font-semibold text-[var(--hh-ink)]">{billTo.address}</p>
        </div>
      ) : null}
    </div>
  );
}

function ActivityBody({
  nextActivity,
  activity,
}: {
  nextActivity: string | null;
  activity: InvoiceDetailActivityItem[];
}) {
  return (
    <div className="px-4 pb-4 sm:px-5">
      {nextActivity ? (
        <p className="mb-2 flex items-start gap-2 rounded-hh-standard bg-[var(--hh-warning-soft-fill)] px-2.5 py-2 text-hh-metadata text-[var(--hh-warning)]">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{nextActivity}</span>
        </p>
      ) : null}
      {activity.length === 0 ? (
        <p className="text-hh-metadata text-[var(--hh-muted)]">No billing activity yet.</p>
      ) : (
        <ul>
          {activity.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2">
              <span
                className={cn(
                  "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                  item.tone === "payment"
                    ? "bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"
                    : "bg-[var(--hh-surface-sunken)] text-[var(--hh-muted)]"
                )}
              >
                {item.tone === "payment" ? (
                  <CircleDollarSign className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--hh-ink)]">{item.title}</p>
                {item.detail ? (
                  <p className="truncate text-hh-metadata text-[var(--hh-muted)]">{item.detail}</p>
                ) : null}
              </div>
              <p className="shrink-0 pt-0.5 text-hh-metadata tabular-nums text-[var(--hh-muted)]">
                {item.dateLabel}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesBody({ notes }: { notes: string }) {
  return (
    <p className="whitespace-pre-wrap px-4 py-4 text-hh-body text-[var(--hh-text)] sm:px-5">
      {notes.trim() ? notes : "No notes on this invoice."}
    </p>
  );
}

function PaymentList({
  rows,
  newestFirst,
  renderPaymentMenu,
}: {
  rows: InvoiceDetailPaymentRow[];
  newestFirst: boolean;
  renderPaymentMenu: (row: InvoiceDetailPaymentRow) => React.ReactNode;
}) {
  const visible = newestFirst ? [...rows].filter((row) => !row.issued).reverse() : rows;
  if (visible.length === 0) {
    return (
      <p className="px-4 py-4 text-hh-body text-[var(--hh-muted)] sm:px-5">No payments recorded.</p>
    );
  }
  return (
    <ul className="divide-y divide-[var(--hh-line-2)]">
      {visible.map((row) => (
        <li
          key={`${newestFirst ? "m" : "d"}-${row.id}`}
          className="flex items-center gap-3 px-4 py-3 sm:px-5"
        >
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-hh-body",
                row.issued ? "text-[var(--hh-muted)]" : "font-medium text-[var(--hh-ink)]"
              )}
            >
              {row.issued ? "Invoice issued" : row.reference || row.method || "Payment"}
            </p>
            <p className="text-hh-metadata tabular-nums text-[var(--hh-muted)]">
              {row.dateLabel}
              {row.voided ? " · Voided" : ""}
              {!row.issued && row.method ? ` · ${row.method}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-hh-body font-semibold tabular-nums",
                row.issued || row.voided ? "text-[var(--hh-muted)]" : "text-[var(--hh-success)]"
              )}
            >
              {row.amountLabel}
            </p>
            <p className="text-hh-metadata tabular-nums text-[var(--hh-muted)]">
              bal. {row.balanceLabel}
            </p>
          </div>
          {renderPaymentMenu(row)}
        </li>
      ))}
    </ul>
  );
}

export function InvoiceDetailLayout(props: InvoiceDetailLayoutProps) {
  const contractSummary =
    props.contract.status === "ready" && props.contract.percentLabel
      ? `${props.contract.percentLabel} billed · ${props.contract.remainingLabel} remaining`
      : "Excluding tax";
  const activitySummary = props.activity[0]
    ? `${props.activity[0].title} · ${props.activity.length} event${props.activity.length === 1 ? "" : "s"}`
    : "Billing history";
  const billSummary = [props.billTo.customerName, props.billTo.address].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-4 px-4 pb-28 pt-4 text-[var(--hh-text)] sm:px-6 xl:gap-6 xl:px-10 xl:pb-16 xl:pt-7">
      <header className="sticky top-0 z-20 -mx-4 bg-[image:var(--hh-grad-mobile-header)] px-4 py-3 text-[var(--hh-sidebar-text-strong)] xl:static xl:mx-0 xl:bg-none xl:bg-transparent xl:p-0 xl:text-[var(--hh-ink)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="hidden items-center gap-1.5 text-hh-metadata text-[var(--hh-muted)] xl:flex">
              <Link
                href={props.backHref}
                data-testid={props.backTestId}
                className="font-semibold text-[var(--hh-link)]"
              >
                {props.backLabel}
              </Link>
              <span aria-hidden="true">/</span>
              <span>{props.invoiceNo}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2 xl:mt-1.5">
              <Link
                href={props.backHref}
                aria-label={props.backLabel}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-hh-standard text-[var(--hh-sidebar-text-strong)] xl:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-title-page">
                <span className="truncate">{props.invoiceNo}</span>
                <span data-testid="invoice-detail-status">{props.status}</span>
              </h1>
            </div>
            <p className="mt-1 truncate text-hh-metadata text-[var(--hh-sidebar-text-pin)] xl:hidden">
              {props.customerProjectLabel}
            </p>
            <p className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 text-hh-body text-[var(--hh-muted)] xl:flex">
              <span className="font-medium text-[var(--hh-ink)]">{props.customer}</span>
              <span aria-hidden="true">·</span>
              <span>{props.project}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Issued {props.issuedLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Due {props.dueLabel}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.moreMenu}
            <div className="hidden items-center gap-2 xl:flex">{props.desktopActions}</div>
          </div>
        </div>
      </header>

      <AmountStrip {...props} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4 xl:gap-6">
          <section className={cardClass} aria-label="Invoice overview line items">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h2 className={titleClass}>Line items</h2>
                <p className={metaClass}>{props.lineCountLabel}</p>
              </div>
              {props.editInvoice}
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_7rem_7.5rem] gap-3 border-t border-[var(--hh-line-2)] bg-[var(--hh-surface-sunken)] px-5 py-2 text-hh-label font-[650] uppercase text-[var(--hh-th)] xl:grid">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="divide-y divide-[var(--hh-line-2)] border-t border-[var(--hh-line-2)]">
              {props.lines.map((line, index) => (
                <li
                  key={line.key}
                  data-testid={`invoice-detail-line-${index + 1}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_5.5rem_7rem_7.5rem] xl:items-center xl:px-5"
                >
                  <div className="min-w-0 xl:col-start-1">
                    <span
                      data-testid={`invoice-detail-line-${index + 1}-description`}
                      className="whitespace-pre-wrap text-hh-body text-[var(--hh-ink)]"
                    >
                      {line.description}
                    </span>
                  </div>
                  <div
                    data-testid={`invoice-detail-line-${index + 1}-amount`}
                    className="text-right text-hh-body font-semibold tabular-nums text-[var(--hh-ink)] xl:col-start-4"
                  >
                    {line.amountLabel}
                  </div>
                  <p className="col-span-2 text-hh-metadata tabular-nums text-[var(--hh-muted)] xl:hidden">
                    <span data-testid={`invoice-detail-line-${index + 1}-qty`}>
                      {line.qtyLabel}
                    </span>
                    {" × "}
                    <span data-testid={`invoice-detail-line-${index + 1}-rate`}>
                      {line.rateLabel}
                    </span>
                  </p>
                  <p className="hidden text-right text-hh-body tabular-nums text-[var(--hh-text)] xl:col-start-2 xl:block">
                    {line.qtyLabel}
                  </p>
                  <p className="hidden text-right text-hh-body tabular-nums text-[var(--hh-text)] xl:col-start-3 xl:block">
                    {line.rateLabel}
                  </p>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--hh-line)] bg-[var(--hh-surface-sunken)] px-4 py-2 sm:px-5 xl:ml-auto xl:w-1/2">
              {props.lineFooter}
            </div>
          </section>

          <section className={cardClass} aria-labelledby="invoice-payments-heading">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h2 id="invoice-payments-heading" className={titleClass}>
                  Payments
                </h2>
                <p className={metaClass}>{props.paymentSummary}</p>
              </div>
              <div className="hidden xl:block">{props.recordPayment}</div>
            </div>
            <div className="hidden border-t border-[var(--hh-line-2)] xl:block">
              <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] gap-3 bg-[var(--hh-surface-sunken)] px-5 py-2 text-hh-label font-[650] uppercase text-[var(--hh-th)]">
                <span>Date</span>
                <span>Method</span>
                <span>Reference</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Balance</span>
                <span className="sr-only">Actions</span>
              </div>
              <ul>
                {props.paymentRows.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-t border-[var(--hh-line-2)] px-5 py-2.5"
                  >
                    <p className="tabular-nums text-hh-body text-[var(--hh-ink)]">
                      {row.dateLabel}
                    </p>
                    <p className="min-w-0 truncate text-hh-body text-[var(--hh-text)]">
                      {row.issued ? "" : row.method}
                      {row.voided ? (
                        <span className="ml-1 text-hh-metadata font-medium text-[var(--hh-danger)]">
                          Voided
                        </span>
                      ) : null}
                    </p>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-hh-body",
                          row.issued ? "text-[var(--hh-muted)]" : "text-[var(--hh-ink)]"
                        )}
                      >
                        {row.issued ? "Invoice issued" : row.reference || "—"}
                      </p>
                      {row.referenceDetail ? (
                        <p className="truncate text-hh-metadata text-[var(--hh-muted)]">
                          {row.referenceDetail}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "text-right text-hh-body font-semibold tabular-nums",
                        row.issued || row.voided
                          ? "text-[var(--hh-muted)]"
                          : "text-[var(--hh-success)]"
                      )}
                    >
                      {row.amountLabel}
                    </p>
                    <p className="text-right text-hh-body font-semibold tabular-nums text-[var(--hh-ink)]">
                      {row.balanceLabel}
                    </p>
                    {props.renderPaymentMenu(row)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-[var(--hh-line-2)] xl:hidden">
              <PaymentList
                rows={props.paymentRows}
                newestFirst
                renderPaymentMenu={props.renderPaymentMenu}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--hh-line)] bg-[var(--hh-surface-sunken)] px-4 py-3 sm:px-5">
              <p className="text-hh-body font-semibold text-[var(--hh-ink)]">
                Balance due
                {props.dueLabel ? (
                  <span className="font-normal text-[var(--hh-muted)]">
                    {" "}
                    · due {props.dueLabel}
                  </span>
                ) : null}
              </p>
              <div className="text-right">
                <p className="hidden text-hh-body font-semibold tabular-nums text-[var(--hh-ink)] xl:block">
                  {props.paymentFooterAmount}
                </p>
                <p className="text-num-m tabular-nums text-[var(--hh-ink)]">
                  {props.paymentFooterBalance}
                </p>
              </div>
            </div>
            {props.deposits.length > 0 ? (
              <div className="border-t border-[var(--hh-line-2)] px-4 py-3 sm:px-5">
                <h3 className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                  Deposits
                </h3>
                <ul className="mt-2 divide-y divide-[var(--hh-line-2)]">
                  {props.deposits.map((deposit) => (
                    <li key={deposit.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block tabular-nums text-hh-body text-[var(--hh-ink)]">
                          {deposit.dateLabel}
                        </span>
                        <span className="block truncate text-hh-metadata text-[var(--hh-muted)]">
                          {deposit.account}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-hh-body font-semibold text-[var(--hh-ink)]">
                        {deposit.amountLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className={cn(cardClass, "hidden xl:block")} aria-label="Notes to customer">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div>
                <h2 className={titleClass}>Notes</h2>
                <p className={metaClass}>Shown on the PDF</p>
              </div>
              {props.editNotes}
            </div>
            <NotesBody notes={props.notes} />
          </section>
        </div>

        <div className="hidden min-w-0 flex-col gap-6 xl:flex">
          <section className={cardClass} aria-label="Contract billing">
            <div className="px-5 py-3.5">
              <h2 className={titleClass}>Contract billing</h2>
              <p className={metaClass}>
                {props.contract.status === "ready" && props.contract.percentLabel
                  ? `${props.contract.percentLabel} of revised contract billed · ex-tax`
                  : "Excluding tax"}
              </p>
            </div>
            <ContractBody contract={props.contract} withTestId />
          </section>
          <section className={cardClass} aria-label="Bill to">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div>
                <h2 className={titleClass}>Bill to</h2>
                <p className={metaClass}>Customer and project</p>
              </div>
              {props.billTo.viewHref ? (
                <Link
                  href={props.billTo.viewHref}
                  className="text-hh-metadata font-semibold text-[var(--hh-link)]"
                >
                  View
                </Link>
              ) : null}
            </div>
            <BillToBody billTo={props.billTo} />
          </section>
          <section className={cardClass} aria-label="Activity">
            <div className="px-5 py-3.5">
              <h2 className={titleClass}>Activity</h2>
              <p className={metaClass}>{props.activityTitle}</p>
            </div>
            <ActivityBody nextActivity={props.nextActivity} activity={props.activity} />
          </section>
        </div>
      </div>

      <div className={cn(cardClass, "xl:hidden")}>
        <details>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-hh-body font-semibold text-[var(--hh-ink)]">
                Contract billing
              </span>
              <span className="mt-0.5 block text-hh-metadata text-[var(--hh-muted)]">
                {contractSummary}
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-[var(--hh-muted)]" />
          </summary>
          <ContractBody contract={props.contract} withTestId={false} />
        </details>
        <details className="border-t border-[var(--hh-line-2)]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-hh-body font-semibold text-[var(--hh-ink)]">Bill to</span>
              <span className="mt-0.5 block truncate text-hh-metadata text-[var(--hh-muted)]">
                {billSummary}
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-[var(--hh-muted)]" />
          </summary>
          <BillToBody billTo={props.billTo} />
        </details>
        <details className="border-t border-[var(--hh-line-2)]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-hh-body font-semibold text-[var(--hh-ink)]">
                Activity
              </span>
              <span className="mt-0.5 block truncate text-hh-metadata text-[var(--hh-muted)]">
                {activitySummary}
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-[var(--hh-muted)]" />
          </summary>
          <ActivityBody nextActivity={props.nextActivity} activity={props.activity} />
        </details>
        <details className="border-t border-[var(--hh-line-2)]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-hh-body font-semibold text-[var(--hh-ink)]">Notes</span>
              <span className="mt-0.5 block text-hh-metadata text-[var(--hh-muted)]">
                Shown on the PDF
              </span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-[var(--hh-muted)]" />
          </summary>
          <NotesBody notes={props.notes} />
        </details>
      </div>

      <div className="fixed inset-x-0 z-20 flex items-center gap-2.5 border-t border-[var(--hh-line)] bg-[var(--hh-surface)] px-4 py-3 xl:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Button asChild variant="secondary" size="sm" className="h-12 min-h-12 w-12 shrink-0 px-0">
          <Link href={props.previewHref} aria-label="Preview PDF" prefetch={false}>
            <Eye className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">{props.mobilePrimary}</div>
      </div>
    </div>
  );
}
