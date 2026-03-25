import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectById, getChangeOrderById, getChangeOrderItems } from "@/lib/data";
import { PageLayout, PageHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { ChangeOrderEditClient } from "./change-order-edit-client";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export default async function ChangeOrderEditPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>;
}) {
  const { id: projectId, coId } = await params;
  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    project = await getProjectById(projectId);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/${coId}/edit`, e);
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
    logServerPageDataError(`projects/${projectId}/change-orders/${coId}/edit co`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "change order")}
        backHref={`/projects/${projectId}?tab=change-orders`}
        backLabel="Back to change orders"
      />
    );
  }
  if (!co || co.projectId !== projectId) notFound();
  if (co.status !== "Draft") redirect(`/projects/${projectId}/change-orders/${coId}`);

  let items: Awaited<ReturnType<typeof getChangeOrderItems>> = [];
  try {
    items = await getChangeOrderItems(coId);
  } catch (e) {
    logServerPageDataError(`projects/${projectId}/change-orders/${coId}/edit items`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "change order line items")}
        backHref={`/projects/${projectId}/change-orders/${coId}`}
        backLabel="Back to change order"
      />
    );
  }
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const total = co.total;

  const coBreadcrumbLabel = co.title?.trim() || co.number.trim() || null;

  return (
    <div className="page-container py-6">
      <SetBreadcrumbEntityTitle label={coBreadcrumbLabel} />
      <PageLayout
        header={
          <PageHeader title={`${co.number} (edit)`}>
            <Link href={`/projects/${projectId}/change-orders/${coId}`}>
              <Button variant="outline" size="sm" className="text-xs">
                Back
              </Button>
            </Link>
          </PageHeader>
        }
      >
        <ChangeOrderEditClient
          projectId={projectId}
          changeOrderId={coId}
          changeOrder={co}
          items={items}
          subtotal={subtotal}
          total={total}
        />
      </PageLayout>
    </div>
  );
}
