import { getWorkerReceipts } from "@/lib/worker-receipts-db";
import { getProjects } from "@/lib/data";
import { ReceiptsClient, type ReceiptRow } from "./receipts-client";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ project_id?: string }> };

export default async function LaborReceiptsPage({ searchParams }: Props) {
  let receipts: Awaited<ReturnType<typeof getWorkerReceipts>> = [];
  try {
    receipts = await getWorkerReceipts();
  } catch {
    // Table may not exist yet
  }
  const params = await searchParams;
  const projectIdFilter = params.project_id?.trim();
  const filteredReceipts = projectIdFilter
    ? receipts.filter((r) => r.projectId === projectIdFilter)
    : receipts;
  const projects = await getProjects();
  const projectById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const initialRows: ReceiptRow[] = filteredReceipts.map((r) => ({
    ...r,
    projectName: r.projectId ? projectById.get(r.projectId) ?? "" : "",
  }));

  return <ReceiptsClient initialRows={initialRows} />;
}
