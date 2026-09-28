"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  Clock,
  Navigation,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatters";
import {
  formatOverviewMoney,
  formatOverviewProgress,
  overviewCostLines,
  type OverviewCostLine,
} from "@/lib/financial/project-overview-display";
import type { InvoiceWithDerived } from "@/lib/invoices-db";
import type { ChangeOrder } from "@/lib/change-orders-db";
import type { ProjectScheduleItem } from "@/lib/project-schedule-db";
import type { ProjectTaskWithWorker } from "@/lib/project-tasks-db";
import type { ActivityLog } from "@/lib/activity-logs-db";

const cardClass =
  "flex min-w-0 flex-col overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] shadow-[var(--hh-shadow-card)]";
const labelClass = "text-[11px] font-[650] uppercase tracking-[0.06em] text-[var(--hh-muted)]";
const moneyClass = "hh-fin tabular-nums";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "";
  const formatted = formatDate(value, "compact");
  const year = Number(value.slice(0, 4));
  if (!Number.isFinite(year) || year === new Date().getFullYear()) return formatted;
  return `${formatted}, ${year}`;
}

function schedulePhase(status: string): "done" | "current" | "next" {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "done" || normalized === "completed" || normalized === "complete")
    return "done";
  if (normalized === "in_progress" || normalized === "active" || normalized === "current")
    return "current";
  return "next";
}

function taskOpen(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized !== "done" && normalized !== "completed" && normalized !== "complete";
}

function OverviewCard({
  title,
  meta,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn(cardClass, className)}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3.5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15.5px] font-[650] leading-[22px] tracking-[-0.01em] text-[var(--hh-ink)]">
            {title}
          </h2>
          {meta ? <p className="mt-0.5 text-[12px] text-[var(--hh-muted)]">{meta}</p> : null}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function TextLink({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "inline-flex min-h-11 items-center gap-1 text-[12.5px] font-[650] text-[var(--hh-link)] lg:min-h-8";
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function CardFooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[42px] w-full items-center justify-center gap-1 border-t border-[var(--hh-line-2)] bg-[var(--hh-surface-footer)] text-[12.5px] font-[650] text-[var(--hh-link)]"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function EmptyCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-[14px] font-[650] text-[var(--hh-ink)]">{title}</p>
      <p className="mt-1 text-[12.5px] leading-5 text-[var(--hh-muted)]">{body}</p>
    </div>
  );
}

export function ProjectOverdueBanner({ invoice }: { invoice: InvoiceWithDerived }) {
  const detail = [invoice.notes || invoice.lineItems[0]?.description, invoice.clientName]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--hh-danger-ring)] bg-[var(--hh-danger-bg)] px-3 py-2.5"
    >
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-hh-standard bg-[var(--hh-danger-bg)] text-[var(--hh-danger-fg)]">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--hh-danger-fg)]">
        <span className="font-[650]">
          {invoice.invoiceNo} is {invoice.daysOverdue} days overdue
        </span>
        <span className={cn(moneyClass, "px-1.5 font-[650]")}>
          {formatOverviewMoney(invoice.balanceDue)}
        </span>
        <span className="text-[var(--hh-ink-2)]">
          {detail ? `${detail} · ` : ""}
          due {displayDate(invoice.dueDate)}
        </span>
      </p>
      <Link
        href={`/financial/invoices/${invoice.id}`}
        className="inline-flex min-h-11 items-center px-2 text-[12.5px] font-[650] text-[var(--hh-link)] lg:min-h-8"
      >
        View
      </Link>
    </div>
  );
}

function CostBars({
  lines,
  actualCost,
  revisedContract,
}: {
  lines: OverviewCostLine[];
  actualCost: number;
  revisedContract: number;
}) {
  const ready = lines.every((line) => finite(line.actual)) && finite(actualCost);
  const scale = ready
    ? Math.max(
        0,
        ...lines.flatMap((line) => [line.actual, line.budget ?? 0].filter((value) => value > 0))
      )
    : 0;
  const hasBudget = lines.some((line) => line.budget != null && line.budget > 0);
  const spentLabel = ready ? formatOverviewMoney(actualCost) : "—";
  const contractLabel = finite(revisedContract) ? formatOverviewMoney(revisedContract) : "—";

  return (
    <div className="px-5 pb-4">
      <p className="text-[12px] text-[var(--hh-muted)]">
        <span
          data-testid="project-overview-cost-actual"
          className={cn(moneyClass, "font-[650] text-[var(--hh-ink)]")}
        >
          {spentLabel}
        </span>{" "}
        spent of {contractLabel} revised contract
      </p>
      <div className="mt-3 space-y-1">
        {lines.map((line) => {
          const over = line.budget != null && line.budget > 0 && line.actual > line.budget;
          const track = scale > 0 ? ((line.budget ?? line.actual) / scale) * 100 : 0;
          const fill =
            scale > 0 ? (Math.min(line.actual, line.budget ?? line.actual) / scale) * 100 : 0;
          const pct =
            line.budget != null && line.budget > 0
              ? formatOverviewProgress((line.actual / line.budget) * 100)
              : null;
          const budgetLabel = line.budget != null ? formatOverviewMoney(line.budget) : null;
          const actualLabel = finite(line.actual) ? formatOverviewMoney(line.actual) : "—";
          const summary = budgetLabel
            ? `${line.label}: ${actualLabel} of ${budgetLabel} budget${pct ? `, ${pct}` : ""}`
            : `${line.label}: ${actualLabel}`;
          return (
            <div
              key={line.label}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_11rem_2.75rem]"
              role="img"
              aria-label={summary}
            >
              <span className="truncate text-[13px] text-[var(--hh-text)]">{line.label}</span>
              <span className="relative h-3 overflow-hidden rounded-[4px] bg-[var(--hh-track-soft)] shadow-[inset_0_0_0_1px_var(--hh-track-ring)]">
                <span
                  className="absolute inset-y-0 left-0 rounded-[4px] bg-[var(--hh-track)]"
                  style={{ width: `${Math.max(0, Math.min(100, track))}%` }}
                />
                <span
                  className="absolute inset-y-0 left-0 rounded-[4px]"
                  style={{
                    width: `${Math.max(0, Math.min(100, over ? (line.actual / scale) * 100 : fill))}%`,
                    backgroundImage: over
                      ? "linear-gradient(var(--hh-danger-bar-hi), var(--hh-danger-fg))"
                      : "var(--hh-grad-bar-navy)",
                  }}
                />
              </span>
              <span className={cn(moneyClass, "text-right text-[13px]")}>
                <span
                  data-testid={`project-overview-cost-${line.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="font-[650] text-[var(--hh-ink)]"
                >
                  {actualLabel}
                </span>
                {budgetLabel ? (
                  <span className="text-[var(--hh-muted)]"> / {budgetLabel}</span>
                ) : null}
              </span>
              <span
                className={cn(
                  "hidden text-right text-[13px] font-[650] sm:block",
                  over ? "text-[var(--hh-danger-fg)]" : "text-[var(--hh-ink-2)]"
                )}
              >
                {pct ?? ""}
                {over ? <span className="sr-only"> over budget</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--hh-muted)]">
        {hasBudget
          ? "Bars scaled to the largest budget or cost line. Over budget is marked in the percent."
          : "Bars scaled to the largest cost line. Category budgets are not on this snapshot."}
      </p>
    </div>
  );
}

export function ProjectOverviewPanels({
  projectId,
  revisedContract,
  approvedChangeOrders,
  billed,
  paid,
  openAr,
  remainingToBill,
  actualCost,
  expenseCost,
  laborCost,
  reimbursementCost,
  subcontractCost,
  commissionCost,
  apCost,
  changeOrderCost,
  laborBudget,
  cashOut,
  cashPosition,
  invoices,
  changeOrders,
  scheduleItems,
  tasks,
  activityLogs,
  recentExpenses,
  clientName,
  customerId,
  address,
  projectManager,
  startDate,
  endDate,
  notes,
  needsReviewCount,
  missingReceiptCount,
  onOpenFinancial,
  onOpenChangeOrders,
  onOpenTasks,
  onOpenPunch,
  onOpenSchedule,
  onOpenPhotos,
  onToggleTask,
}: {
  projectId: string;
  revisedContract: number;
  approvedChangeOrders: number;
  billed: number;
  paid: number;
  openAr: number;
  remainingToBill: number;
  actualCost: number;
  expenseCost: number;
  laborCost: number;
  reimbursementCost: number;
  subcontractCost: number;
  commissionCost: number;
  apCost: number;
  changeOrderCost: number;
  laborBudget: number | null;
  cashOut: number;
  cashPosition: number;
  invoices: InvoiceWithDerived[];
  changeOrders: ChangeOrder[];
  scheduleItems: ProjectScheduleItem[];
  tasks: ProjectTaskWithWorker[];
  activityLogs: ActivityLog[];
  recentExpenses: Array<{
    id: string;
    date: string;
    vendorName: string;
    memo: string | null;
    amount: number;
  }>;
  clientName: string | null;
  customerId: string | null;
  address: string | null;
  projectManager: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  needsReviewCount: number | null;
  missingReceiptCount: number | null;
  onOpenFinancial: () => void;
  onOpenChangeOrders: () => void;
  onOpenTasks: () => void;
  onOpenPunch: () => void;
  onOpenSchedule: () => void;
  onOpenPhotos: () => void;
  onToggleTask: (taskId: string, done: boolean) => void;
}) {
  const lines = overviewCostLines(
    {
      laborCost,
      expenseCost,
      subcontractCost,
      reimbursementCost,
      commissionCost,
      apCost,
      changeOrderCost,
      actualCost,
    },
    laborBudget
  );
  const openTasks = tasks.filter((task) => taskOpen(task.status));
  const doneSchedule = scheduleItems.filter((item) => schedulePhase(item.status) === "done").length;
  const scheduleProgress =
    scheduleItems.length > 0 ? (doneSchedule / scheduleItems.length) * 100 : null;
  const crew = Array.from(
    new Map(
      openTasks
        .filter((task) => task.worker_name?.trim())
        .map((task) => [task.worker_name!.trim(), task.worker_name!.trim()])
    ).values()
  );
  const activity = activityLogs.slice(0, 4);
  const invoiceRows = invoices.slice(0, 3);
  const changeOrderRows = changeOrders.slice(0, 3);
  const dateLabel = [displayDate(startDate), displayDate(endDate)].filter(Boolean).join(" – ");
  const mapsHref = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;

  const quickActions = [
    {
      label: "Log time",
      meta: "Open project labor",
      href: `/projects/${projectId}/labor`,
      icon: Clock,
    },
    {
      label: "Add expense",
      meta: "Project expenses",
      href: `/financial/expenses?project_id=${encodeURIComponent(projectId)}`,
      icon: Receipt,
    },
    { label: "Photo", meta: "Site photos", onClick: onOpenPhotos, icon: Camera },
    { label: "Punch item", meta: "Open punch list", onClick: onOpenPunch, icon: Check },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            const body = (
              <>
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[var(--hh-sidebar-text-strong)]"
                  style={{ backgroundImage: "var(--hh-grad-bar-navy)" }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="mt-3 block text-[16px] font-[650] leading-5 text-[var(--hh-ink)]">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--hh-muted)]">
                  {action.meta}
                </span>
              </>
            );
            const className = cn(cardClass, "min-h-[112px] rounded-card-m p-4 text-left");
            return action.href ? (
              <Link key={action.label} href={action.href} className={className}>
                {body}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={className}
              >
                {body}
              </button>
            );
          })}
        </div>

        <OverviewCard
          title="Today's tasks"
          meta={
            tasks.length > 0
              ? `${tasks.length - openTasks.length} of ${tasks.length} done · ${openTasks.length} open`
              : undefined
          }
        >
          {tasks.length === 0 ? (
            <EmptyCopy title="No tasks yet" body="Tasks for this project will show up here." />
          ) : (
            <ul>
              {tasks.slice(0, 6).map((task, index) => {
                const done = !taskOpen(task.status);
                const overdue =
                  taskOpen(task.status) &&
                  task.due_date &&
                  task.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <li key={task.id} className="border-t border-[var(--hh-line-2)] first:border-t-0">
                    <div className="flex min-h-14 items-start gap-3 px-5 py-3">
                      <button
                        type="button"
                        aria-pressed={done}
                        aria-label={done ? `Mark ${task.title} open` : `Mark ${task.title} done`}
                        onClick={() => onToggleTask(task.id, !done)}
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border",
                          done
                            ? "border-[var(--hh-success-solid)] bg-[var(--hh-success-bg)] text-[var(--hh-success-fg)]"
                            : "border-[var(--hh-line-input)] bg-[var(--hh-surface)]"
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[15px] leading-5 text-[var(--hh-ink)]",
                            done && "line-through"
                          )}
                        >
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--hh-muted)]">
                          {[task.worker_name, task.due_date ? displayDate(task.due_date) : null]
                            .filter(Boolean)
                            .join(" · ") || "No due date"}
                          {overdue ? (
                            <span className="ml-1 font-[650] text-[var(--hh-danger-fg)]">
                              Overdue
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {!done && index === tasks.findIndex((item) => taskOpen(item.status)) ? (
                        <span className="rounded-full bg-[var(--hh-chip-strong)] px-2 py-0.5 text-[11px] font-[650] text-[var(--hh-th)]">
                          Next
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <CardFooterLink label="View tasks" onClick={onOpenTasks} />
        </OverviewCard>

        <OverviewCard title="Crew on site">
          {crew.length === 0 ? (
            <EmptyCopy
              title="No assigned crew"
              body="Workers named on open tasks will show up here."
            />
          ) : (
            <ul>
              {crew.map((name) => (
                <li
                  key={name}
                  className="flex min-h-14 items-center gap-3 border-t border-[var(--hh-line-2)] px-5 py-3 first:border-t-0"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--hh-chip)] text-[12px] font-[650] text-[var(--hh-ink)]">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-[650] text-[var(--hh-ink)]">
                      {name}
                    </span>
                    <span className="block text-[12px] text-[var(--hh-muted)]">
                      Assigned on an open task
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </OverviewCard>
        {mapsHref ? (
          <Button asChild variant="secondary" className="w-full">
            <a href={mapsHref} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Navigate
            </a>
          </Button>
        ) : null}
      </div>

      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,352px)] lg:items-stretch lg:gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <OverviewCard
            title="Budget vs. actual"
            action={<TextLink onClick={onOpenFinancial}>Cost detail</TextLink>}
          >
            {lines.length === 0 ? (
              <EmptyCopy title="No cost lines" body="Snapshot cost categories will show up here." />
            ) : (
              <CostBars lines={lines} actualCost={actualCost} revisedContract={revisedContract} />
            )}
          </OverviewCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <OverviewCard
              title="Invoices"
              meta={finite(billed) ? `${formatOverviewMoney(billed)} billed` : undefined}
            >
              {invoiceRows.length === 0 ? (
                <EmptyCopy
                  title="No invoices yet"
                  body="Invoices for this project will show up here."
                />
              ) : (
                <ul>
                  {invoiceRows.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="border-t border-[var(--hh-line-2)] first:border-t-0"
                    >
                      <Link
                        href={`/financial/invoices/${invoice.id}`}
                        className="block px-5 py-3 hover:bg-[var(--hh-hover)]"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] font-[650] text-[var(--hh-ink)]">
                            {invoice.invoiceNo}
                          </span>
                          <span
                            className={cn(
                              moneyClass,
                              "text-[13px] font-[650] text-[var(--hh-ink)]"
                            )}
                          >
                            {formatOverviewMoney(invoice.total)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[var(--hh-muted)]">
                          {invoice.lineItems[0]?.description || invoice.notes || invoice.clientName}
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] text-[var(--hh-muted)]">
                            Issued {displayDate(invoice.issueDate)}
                          </span>
                          <InvoiceStatusBadge status={invoice.computedStatus} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <CardFooterLink
                label={`View all ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
                onClick={onOpenFinancial}
              />
            </OverviewCard>

            <OverviewCard
              title="Change orders"
              meta={
                finite(approvedChangeOrders) && approvedChangeOrders !== 0
                  ? `${formatOverviewMoney(approvedChangeOrders, { sign: "always" })} approved`
                  : undefined
              }
            >
              {changeOrderRows.length === 0 ? (
                <EmptyCopy
                  title="No change orders yet"
                  body="Change orders for this project will show up here."
                />
              ) : (
                <ul>
                  {changeOrderRows.map((order) => (
                    <li
                      key={order.id}
                      className="border-t border-[var(--hh-line-2)] first:border-t-0"
                    >
                      <Link
                        href={`/projects/${projectId}/change-orders/${order.id}`}
                        className="block px-5 py-3 hover:bg-[var(--hh-hover)]"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] font-[650] text-[var(--hh-ink)]">
                            {order.number}
                          </span>
                          <span
                            className={cn(
                              moneyClass,
                              "text-[13px] font-[650] text-[var(--hh-ink)]"
                            )}
                          >
                            {formatOverviewMoney(order.total, { sign: "always" })}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[var(--hh-muted)]">
                          {order.title || order.description || "Change order"}
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] text-[var(--hh-muted)]">
                            {displayDate(order.date)}
                          </span>
                          <Badge
                            variant={
                              order.status === "Approved"
                                ? "success"
                                : order.status === "Rejected"
                                  ? "danger"
                                  : order.status === "Pending Approval"
                                    ? "warning"
                                    : "neutral"
                            }
                          >
                            {order.status}
                          </Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <CardFooterLink
                label={`View all ${changeOrders.length} change order${changeOrders.length === 1 ? "" : "s"}`}
                onClick={onOpenChangeOrders}
              />
            </OverviewCard>
          </div>

          <OverviewCard
            title="Cash"
            meta="Collected, cash out, and net cash from the project snapshot"
            className="lg:flex-1"
          >
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              <div>
                <p className={labelClass}>Collected</p>
                <p className={cn(moneyClass, "mt-1 text-[16px] font-[650] text-[var(--hh-ink)]")}>
                  {formatOverviewMoney(paid)}
                </p>
              </div>
              <div>
                <p className={labelClass}>Cash out</p>
                <p className={cn(moneyClass, "mt-1 text-[16px] font-[650] text-[var(--hh-ink)]")}>
                  {formatOverviewMoney(cashOut)}
                </p>
              </div>
              <div>
                <p className={labelClass}>Net cash</p>
                <p className={cn(moneyClass, "mt-1 text-[16px] font-[650] text-[var(--hh-ink)]")}>
                  {formatOverviewMoney(cashPosition, { sign: "always" })}
                </p>
              </div>
            </div>
            <p className="border-t border-[var(--hh-line-2)] bg-[var(--hh-surface-footer)] px-5 py-3 text-[12px] text-[var(--hh-muted)]">
              A cumulative cash-flow line is not shown. This project has no authoritative
              transaction history to plot.
            </p>
          </OverviewCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <OverviewCard
            title="Details"
            action={<TextLink onClick={onOpenFinancial}>Financial</TextLink>}
          >
            <div className="px-5 pb-4">
              <DetailItem label="Customer">
                {customerId && clientName ? (
                  <Link
                    href={`/customers/${customerId}`}
                    className="font-[650] text-[var(--hh-link)]"
                  >
                    {clientName}
                  </Link>
                ) : (
                  clientName || "—"
                )}
              </DetailItem>
              <DetailItem label="Project manager">{projectManager || "—"}</DetailItem>
              <DetailItem label="Address">{address || "—"}</DetailItem>
              <DetailItem label="Dates">{dateLabel || "—"}</DetailItem>
              <DetailItem label="Revised contract">
                {formatOverviewMoney(revisedContract)}
              </DetailItem>
              <DetailItem label="Billed">
                <span data-testid="project-overview-billed">{formatOverviewMoney(billed)}</span>
              </DetailItem>
              <DetailItem label="Paid">
                <span data-testid="project-overview-paid">{formatOverviewMoney(paid)}</span>
              </DetailItem>
              <DetailItem label="Open AR">
                <span data-testid="project-overview-open-ar">{formatOverviewMoney(openAr)}</span>
              </DetailItem>
              <DetailItem label="Remaining to bill">
                {formatOverviewMoney(remainingToBill)}
              </DetailItem>
              {notes ? <DetailItem label="Notes">{notes}</DetailItem> : null}
            </div>
            <div className="flex flex-wrap gap-2 px-5 pb-4">
              <Button type="button" variant="secondary" size="sm" onClick={onOpenTasks}>
                Open tasks · {openTasks.length}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onOpenPunch}>
                Open punch
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={onOpenSchedule}>
                View schedule
              </Button>
            </div>
            <div className="space-y-2 border-t border-[var(--hh-line-2)] px-5 py-3 text-[13px]">
              <p>
                <Link
                  href={`/financial/inbox?project_id=${encodeURIComponent(projectId)}`}
                  className="text-[var(--hh-link)]"
                >
                  Needs review · {needsReviewCount ?? "Unavailable"}
                </Link>
              </p>
              <p>
                <Link
                  href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`}
                  className="text-[var(--hh-link)]"
                >
                  Missing receipts · {missingReceiptCount ?? "Unavailable"}
                </Link>
              </p>
            </div>
          </OverviewCard>

          <OverviewCard
            title="Schedule"
            action={<TextLink onClick={onOpenSchedule}>Open</TextLink>}
          >
            {scheduleItems.length === 0 ? (
              <EmptyCopy
                title="No schedule items"
                body="Schedule items for this project will show up here."
              />
            ) : (
              <div className="px-5 pb-4">
                <div className="mb-3 text-[12px] text-[var(--hh-muted)]">
                  <span>
                    {doneSchedule} of {scheduleItems.length} complete
                  </span>
                </div>
                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[var(--hh-track)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, scheduleProgress ?? 0))}%`,
                      backgroundImage: "var(--hh-grad-bar-navy)",
                    }}
                  />
                </div>
                <ol className="space-y-3">
                  {scheduleItems.slice(0, 5).map((item) => {
                    const phase = schedulePhase(item.status);
                    return (
                      <li key={item.id} className="flex gap-3">
                        <span
                          className={cn(
                            "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                            phase === "done" &&
                              "bg-[var(--hh-success-solid)] text-[var(--hh-surface)]",
                            phase === "current" && "bg-[var(--hh-navy)] text-[var(--hh-surface)]",
                            phase === "next" &&
                              "border border-[var(--hh-line-input)] bg-[var(--hh-surface)]"
                          )}
                          aria-hidden="true"
                        >
                          {phase === "done" ? <Check className="h-3 w-3" /> : null}
                          {phase === "current" ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--hh-surface)]" />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-[650] text-[var(--hh-ink)]">
                            {item.title}
                          </span>
                          <span className="block text-[11.5px] text-[var(--hh-muted)]">
                            {[displayDate(item.start_date), item.status]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </OverviewCard>

          <OverviewCard title="Activity" className="lg:flex-1">
            {activity.length === 0 && recentExpenses.length === 0 ? (
              <EmptyCopy title="No recent activity" body="Project activity will show up here." />
            ) : (
              <ul>
                {(activity.length > 0 ? activity : []).map((log) => (
                  <li
                    key={log.id}
                    className="flex gap-3 border-t border-[var(--hh-line-2)] px-5 py-3 first:border-t-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--hh-chip)] text-[11px] font-[650] text-[var(--hh-ink)]">
                      {(log.type || "A").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-[var(--hh-text)]">
                        {log.description || log.type}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-[var(--hh-muted)]">
                        {displayDate(log.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
                {activity.length === 0
                  ? recentExpenses.slice(0, 4).map((row) => (
                      <li
                        key={row.id}
                        className="flex gap-3 border-t border-[var(--hh-line-2)] px-5 py-3 first:border-t-0"
                      >
                        <span className="min-w-0 flex-1 text-[13px] text-[var(--hh-text)]">
                          {row.vendorName || row.memo || "Cost recorded"}
                          <span className="mt-0.5 block text-[11.5px] text-[var(--hh-muted)]">
                            {displayDate(row.date)}
                          </span>
                        </span>
                        <span
                          className={cn(moneyClass, "text-[13px] font-[650] text-[var(--hh-ink)]")}
                        >
                          {formatOverviewMoney(row.amount)}
                        </span>
                      </li>
                    ))
                  : null}
              </ul>
            )}
          </OverviewCard>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--hh-line-2)] py-2.5 last:border-b-0">
      <span className="text-[13px] text-[var(--hh-muted)]">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-[650] text-[var(--hh-ink)]">
        {children}
      </span>
    </div>
  );
}

export function ProjectKpiRow({
  profitText,
  marginText,
  marginValue,
  collected,
  openAr,
  collectedUnavailable,
  revisedContract,
  approvedChangeOrders,
  billed,
  remainingToBill,
  actualText,
  contractText,
  onActualCost,
}: {
  profitText: string;
  marginText: string;
  marginValue: number | null;
  collected: number;
  openAr: number;
  collectedUnavailable: boolean;
  revisedContract: number;
  approvedChangeOrders: number;
  billed: number;
  remainingToBill: number;
  actualText: string;
  contractText: string;
  onActualCost: () => void;
}) {
  const marginWidth =
    marginValue == null ? 0 : Math.max(0, Math.min(100, (marginValue / 50) * 100));
  const scaleBase = finite(revisedContract) && revisedContract > 0 ? revisedContract : null;
  const collectedWidth =
    scaleBase != null && finite(collected)
      ? Math.max(0, Math.min(100, (collected / scaleBase) * 100))
      : 0;
  const openWidth =
    scaleBase != null && finite(openAr)
      ? Math.max(0, Math.min(100, (openAr / scaleBase) * 100))
      : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1.12fr)_minmax(240px,0.96fr)]">
      <section
        className="rounded-card border border-[var(--hh-navy-edge)] p-5 text-[var(--hh-sidebar-text-strong)] shadow-[var(--hh-shadow-hero)]"
        style={{ backgroundImage: "var(--hh-grad-hero)" }}
      >
        <p className={cn(labelClass, "text-[var(--hh-sidebar-text-pin)]")}>Est. profit</p>
        <p
          data-testid="project-header-profit"
          className={cn(
            moneyClass,
            "mt-2 text-[40px] font-[700] leading-[46px] tracking-[-0.03em]"
          )}
        >
          {profitText}
        </p>
        <p className="mt-2 text-[13px] text-[var(--hh-sidebar-text-pin)]">
          <span
            data-testid="project-header-margin"
            className="font-[650] text-[var(--hh-sidebar-text-strong)]"
          >
            {marginText}
          </span>
          {marginText !== "—" ? " margin" : null}
        </p>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--hh-sidebar-raised)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${marginWidth}%`,
                backgroundImage: "var(--hh-grad-hero-bar)",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-[var(--hh-sidebar-text-pin)]">
            <span>0%</span>
            <span>50%</span>
          </div>
        </div>
      </section>

      <section className={cn(cardClass, "p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={labelClass}>Cash collected</p>
            <p
              data-testid="project-header-collected"
              className={cn(
                moneyClass,
                "mt-1 text-[28px] font-[700] leading-[34px] tracking-[-0.025em] text-[var(--hh-ink)]"
              )}
            >
              {collectedUnavailable ? "Unavailable" : formatOverviewMoney(collected)}
            </p>
          </div>
          <div className="text-right">
            <p className={labelClass}>Open A/R</p>
            <p
              data-testid="project-header-need-collect"
              className={cn(
                moneyClass,
                "mt-1 text-[20px] font-[650] leading-[34px] tracking-[-0.02em] text-[var(--hh-ink)]"
              )}
            >
              {formatOverviewMoney(openAr)}
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex h-2 overflow-hidden rounded-full bg-[var(--hh-track)]"
          role="img"
          aria-label={`Collected ${collectedUnavailable ? "unavailable" : formatOverviewMoney(collected)}, open A/R ${formatOverviewMoney(openAr)}`}
        >
          <span
            className="h-full"
            style={{ width: `${collectedWidth}%`, backgroundImage: "var(--hh-grad-bar-navy)" }}
          />
          <span className="h-full bg-[var(--hh-series-2)]" style={{ width: `${openWidth}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-[var(--hh-muted)]">
          <span className="mr-3 inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--hh-navy)]" aria-hidden="true" />
            Collected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--hh-series-2)]" aria-hidden="true" />
            Open A/R
          </span>
          {finite(revisedContract) ? (
            <span className="mt-1 block">
              vs {formatOverviewMoney(revisedContract)} revised contract
            </span>
          ) : null}
        </p>
      </section>

      <section className={cn(cardClass, "divide-y divide-[var(--hh-line-2)] px-5")}>
        <div className="flex items-start justify-between gap-3 py-3">
          <div>
            <p className={labelClass}>Revised contract</p>
            {finite(approvedChangeOrders) && approvedChangeOrders !== 0 ? (
              <p className="mt-1 text-[12px] text-[var(--hh-muted)]">
                incl. {formatOverviewMoney(approvedChangeOrders, { sign: "always" })} approved
                change orders
              </p>
            ) : null}
          </div>
          <p
            data-testid="project-header-contract-value"
            className={cn(moneyClass, "text-[16px] font-[650] text-[var(--hh-ink)]")}
          >
            {contractText}
          </p>
        </div>
        <div className="flex items-start justify-between gap-3 py-3">
          <div>
            <p className={labelClass}>Billed</p>
            <p className="mt-1 text-[12px] text-[var(--hh-muted)]">
              Remaining to bill {formatOverviewMoney(remainingToBill)}
            </p>
          </div>
          <p className={cn(moneyClass, "text-[16px] font-[650] text-[var(--hh-ink)]")}>
            {formatOverviewMoney(billed)}
          </p>
        </div>
        <div className="flex items-start justify-between gap-3 py-3">
          <div>
            <p className={labelClass}>Actual cost</p>
          </div>
          <button
            type="button"
            onClick={onActualCost}
            data-testid="project-header-actual-cost"
            className={cn(
              moneyClass,
              "text-[16px] font-[650] text-[var(--hh-link)] underline decoration-[var(--hh-link-underline)] underline-offset-4"
            )}
          >
            {actualText}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectMobileIntro({
  backHref,
  backLabel,
  name,
  status,
  address,
  scheduleProgress,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  status: React.ReactNode;
  address: string | null;
  scheduleProgress: string | null;
}) {
  return (
    <div
      className="-mx-4 mb-4 px-4 pb-4 pt-3 text-[var(--hh-sidebar-text-strong)] sm:-mx-6 sm:px-6 lg:hidden"
      style={{ backgroundImage: "var(--hh-grad-mobile-header)" }}
    >
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-[650] text-[var(--hh-sidebar-text-item)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-[650] uppercase tracking-[0.08em] text-[var(--hh-sidebar-text-pin)]">
          Project
        </p>
        {status}
      </div>
      <h1 className="mt-1 text-[26px] font-[650] leading-[31px] tracking-[-0.022em]">{name}</h1>
      {address ? (
        <p className="mt-1 text-[13px] text-[var(--hh-sidebar-text-item)]">{address}</p>
      ) : null}
      {scheduleProgress ? (
        <p className="mt-3 text-[13px] text-[var(--hh-sidebar-text-pin)]">
          Schedule items {scheduleProgress}
        </p>
      ) : null}
    </div>
  );
}
