import { notFound } from "next/navigation";

import { ReceiptsClient, type ReceiptRow } from "@/app/labor/receipts/receipts-client";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { getProjects } from "@/lib/data";
import {
  type ExpenseOperationsSearchParams,
  normalizeWorkerReceiptStatusFilter,
} from "@/lib/expense-operations-routing";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getWorkerReceipts } from "@/lib/worker-receipts-db";

import "../../expenses/expenses-ui-theme.css";
import "../../../labor/receipts/worker-receipts-ui.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams: Promise<ExpenseOperationsSearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function WorkerSubmittedInboxPage({ searchParams }: Props) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();

  const params = await searchParams;
  const projectIdFilter = firstParam(params.project_id);
  let receipts: Awaited<ReturnType<typeof getWorkerReceipts>> = [];
  let dataLoadWarning: string | null = null;
  try {
    receipts = await getWorkerReceipts(supabase);
  } catch (error) {
    logServerPageDataError("financial/inbox/worker", error);
    dataLoadWarning = serverDataLoadWarning(error, "worker-submitted receipts");
  }

  const filteredReceipts = projectIdFilter
    ? receipts.filter((receipt) => receipt.projectId === projectIdFilter)
    : receipts;
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  try {
    projects = await getProjects(supabase);
  } catch (error) {
    logServerPageDataError("financial/inbox/worker projects", error);
    dataLoadWarning ??= serverDataLoadWarning(error, "projects");
  }
  const projectById = new Map(projects.map((project) => [project.id, project.name ?? ""]));
  const initialRows: ReceiptRow[] = filteredReceipts.map((receipt) => ({
    ...receipt,
    projectName: receipt.projectId ? (projectById.get(receipt.projectId) ?? "") : "",
  }));

  return (
    <ReceiptsClient
      initialRows={initialRows}
      dataLoadWarning={dataLoadWarning}
      initialSelectedId={firstParam(params.ops_record) || null}
      initialFilters={{
        workerId: firstParam(params.workerId),
        projectId: projectIdFilter,
        status: normalizeWorkerReceiptStatusFilter(params.status),
        dateFrom: firstParam(params.date_from),
        dateTo: firstParam(params.date_to),
      }}
    />
  );
}
