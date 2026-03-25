import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProjectById,
  getChangeOrderById,
  getChangeOrderItems,
  getChangeOrderAttachments,
} from "@/lib/data";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { ChangeOrderStatusDropdown } from "./change-order-header-actions";
import { ChangeOrderLineItemsTable } from "./change-order-line-items-table";
import { ChangeOrderAttachmentsSection } from "./change-order-attachments-section";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>;
}) {
  const { id: projectId, coId } = await params;
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    project = await getProjectById(projectId);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/${coId}`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "project")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  if (!project) notFound();

  let co: Awaited<ReturnType<typeof getChangeOrderById>> | null = null;
  try {
    co = await getChangeOrderById(coId);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/${coId} co`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "change order")}
        backHref={`/projects/${projectId}?tab=change-orders`}
        backLabel="Back to change orders"
      />
    );
  }
  if (!co || co.projectId !== projectId) notFound();

  let items: Awaited<ReturnType<typeof getChangeOrderItems>> = [];
  let attachments: Awaited<ReturnType<typeof getChangeOrderAttachments>> = [];
  let dataLoadWarning: string | null = null;
  try {
    [items, attachments] = await Promise.all([
      getChangeOrderItems(coId),
      getChangeOrderAttachments(coId),
    ]);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/${coId} items`, e);
    dataLoadWarning = serverDataLoadWarning(e, "change order line items");
  }
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const revenueAmount = co.amount != null ? co.amount : co.total;
  const isLocked = co.status === "Approved";

  const coBreadcrumbLabel = co.title?.trim() || co.number.trim() || null;

  return (
    <div className="page-container py-6">
      <SetBreadcrumbEntityTitle label={coBreadcrumbLabel} />
      {dataLoadWarning ? (
        <p
          className="mb-3 border-b border-border/60 pb-3 text-sm text-muted-foreground"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}
      <div className="mb-3">
        <Link
          href={`/projects/${projectId}?tab=change-orders`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Change orders
        </Link>
      </div>
      <PageLayout
        header={
          <PageHeader
            title={co.title || co.number}
            description={
              co.approvedAt
                ? `Approved ${new Date(co.approvedAt).toLocaleDateString()}${co.approvedBy ? ` by ${co.approvedBy}` : ""}`
                : (co.description ?? undefined)
            }
          >
            <div className="flex items-center gap-3">
              <ChangeOrderStatusDropdown
                changeOrderId={co.id}
                projectId={projectId}
                currentStatus={co.status}
              />
              {!isLocked && (
                <Link href={`/projects/${projectId}/change-orders/${coId}/edit`}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </Link>
              )}
            </div>
          </PageHeader>
        }
      >
        <SectionHeader label="Summary" />
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {(co.title || co.description) && (
            <>
              {co.title && (
                <div>
                  <span className="text-muted-foreground">Title</span>
                  <p className="font-medium">{co.title}</p>
                </div>
              )}
              {co.description && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Description</span>
                  <p className="font-medium">{co.description}</p>
                </div>
              )}
            </>
          )}
          <div>
            <span className="text-muted-foreground">Revenue impact (amount)</span>
            <p className="font-medium tabular-nums">${fmtUsd(revenueAmount)}</p>
          </div>
          {co.costImpact != null && (
            <div>
              <span className="text-muted-foreground">Cost impact</span>
              <p className="font-medium tabular-nums">${fmtUsd(co.costImpact)}</p>
            </div>
          )}
          {co.scheduleImpactDays != null && (
            <div>
              <span className="text-muted-foreground">Schedule impact</span>
              <p className="font-medium tabular-nums">{co.scheduleImpactDays} days</p>
            </div>
          )}
        </div>
        <Divider />
        <SectionHeader label="Line items" />
        <Divider />
        {items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No line items.</p>
        ) : (
          <ChangeOrderLineItemsTable items={items} />
        )}
        <div className="mt-6 flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-8">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="num">${fmtUsd(subtotal)}</span>
          </div>
          <div className="flex gap-8 font-medium">
            <span className="text-muted-foreground">Total</span>
            <span className="num">${fmtUsd(co.total)}</span>
          </div>
        </div>
        <Divider />
        <ChangeOrderAttachmentsSection
          changeOrderId={coId}
          projectId={projectId}
          attachments={attachments}
          readOnly={isLocked}
        />
      </PageLayout>
    </div>
  );
}
