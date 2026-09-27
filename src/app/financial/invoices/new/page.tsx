import NewInvoiceClient from "./new-invoice-client";
import { getEstimateInvoicePrefill } from "./estimate-prefill";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { notFound } from "next/navigation";
import type { ProjectInvoicePrefill } from "./new-invoice-client";
import { safeEstimateReturnPath } from "@/app/estimates/_components/estimate-workflow-continuity";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams?: Promise<{
    estimateId?: string;
    paymentScheduleItemId?: string;
    projectId?: string;
    returnTo?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const estimateId = params.estimateId?.trim() ?? "";
  const paymentScheduleItemId = params.paymentScheduleItemId?.trim() ?? "";
  const projectId = params.projectId?.trim() ?? "";
  const returnTo = safeEstimateReturnPath(params.returnTo);
  const estimatePrefill =
    estimateId && paymentScheduleItemId
      ? await getEstimateInvoicePrefill(estimateId, paymentScheduleItemId)
      : null;
  let projectPrefill: ProjectInvoicePrefill | null = null;

  if (!estimatePrefill && projectId) {
    let project;
    try {
      const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
      if (!guard.ok) throw new Error(guard.error);
      project = await getProjectByIdWithClient(guard.client, projectId);
    } catch {
      return (
        <ServerDataLoadFallback
          message="Project invoice context is unavailable. Please retry."
          backHref={`/projects/${encodeURIComponent(projectId)}?tab=financial`}
          backLabel="Back to project"
        />
      );
    }
    if (!project) notFound();
    projectPrefill = {
      projectId: project.id,
      projectName: project.name,
      customerId: project.customerId ?? null,
      customerName: project.client ?? null,
    };
  }

  return (
    <NewInvoiceClient
      estimatePrefill={estimatePrefill}
      projectPrefill={projectPrefill}
      estimateReturnPath={returnTo}
    />
  );
}
