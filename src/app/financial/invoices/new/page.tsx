import NewInvoiceClient from "./new-invoice-runtime";
import { getEstimateInvoicePrefill } from "./estimate-prefill";
import { getProjectByIdWithClient } from "@/lib/projects-db";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
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
    const supabase = getServerSupabaseInternalNoStore();
    if (supabase) {
      try {
        const project = await getProjectByIdWithClient(supabase, projectId);
        if (project) {
          projectPrefill = {
            projectId: project.id,
            projectName: project.name,
            customerId: project.customerId ?? null,
            customerName: project.client ?? null,
          };
        }
      } catch {
        projectPrefill = null;
      }
    }
  }

  return (
    <NewInvoiceClient
      estimatePrefill={estimatePrefill}
      projectPrefill={projectPrefill}
      estimateReturnPath={returnTo}
    />
  );
}
