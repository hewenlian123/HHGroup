import { getWorkerReceipts } from "@/lib/worker-receipts-db";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { getProjects } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ReceiptsClient, type ReceiptRow } from "./receipts-client";

// Always render with fresh data — no static cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { searchParams: Promise<{ project_id?: string }> };

export default async function LaborReceiptsPage({ searchParams }: Props) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const supabase = await createServerSupabaseClient();
  if (!supabase) notFound();
  let receipts: Awaited<ReturnType<typeof getWorkerReceipts>> = [];
  let dataLoadWarning: string | null = null;
  try {
    receipts = await getWorkerReceipts(supabase);
  } catch (error) {
    logServerPageDataError("labor/receipts", error);
    dataLoadWarning = serverDataLoadWarning(error, "worker receipts");
  }
  const params = await searchParams;
  const projectIdFilter = params.project_id?.trim();
  const filteredReceipts = projectIdFilter
    ? receipts.filter((r) => r.projectId === projectIdFilter)
    : receipts;
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  try {
    projects = await getProjects(supabase);
  } catch (e) {
    logServerPageDataError("labor/receipts projects", e);
    dataLoadWarning ??= serverDataLoadWarning(e, "projects");
  }
  const projectById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const initialRows: ReceiptRow[] = filteredReceipts.map((r) => ({
    ...r,
    projectName: r.projectId ? (projectById.get(r.projectId) ?? "") : "",
  }));

  return <ReceiptsClient initialRows={initialRows} dataLoadWarning={dataLoadWarning} />;
}
