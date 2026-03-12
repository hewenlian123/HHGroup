import { getWorkerReceipts } from "@/lib/worker-receipts-db";
import { getProjects } from "@/lib/data";
import { ReceiptsClient, type ReceiptRow } from "./receipts-client";

export const dynamic = "force-dynamic";

export default async function LaborReceiptsPage() {
  let receipts: Awaited<ReturnType<typeof getWorkerReceipts>> = [];
  try {
    receipts = await getWorkerReceipts();
  } catch {
    // Table may not exist yet
  }
  const projects = await getProjects();
  const projectById = new Map(projects.map((p) => [p.id, p.name ?? ""]));
  const initialRows: ReceiptRow[] = receipts.map((r) => ({
    ...r,
    projectName: r.projectId ? projectById.get(r.projectId) ?? "" : "",
  }));

  return <ReceiptsClient initialRows={initialRows} />;
}
