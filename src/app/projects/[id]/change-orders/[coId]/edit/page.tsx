import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getProjectById,
  getChangeOrderById,
  getChangeOrderItems,
} from "@/lib/data";
import {
  PageLayout,
  PageHeader,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { ChangeOrderEditClient } from "./change-order-edit-client";

export default async function ChangeOrderEditPage({
  params,
}: {
  params: Promise<{ id: string; coId: string }>;
}) {
  const { id: projectId, coId } = await params;
  const project = await getProjectById(projectId);
  if (!project) notFound();
  const co = await getChangeOrderById(coId);
  if (!co || co.projectId !== projectId) notFound();
  if (co.status !== "Draft") redirect(`/projects/${projectId}/change-orders/${coId}`);
  const items = await getChangeOrderItems(coId);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const total = co.total;

  return (
    <div className="page-container py-6">
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
