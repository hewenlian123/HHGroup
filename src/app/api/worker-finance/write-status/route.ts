import { requireCompanyRequestClient } from "@/lib/auth-boundary";
import {
  workerFinanceSchemaReady,
  workerFinanceMaintenanceResponse,
} from "@/lib/worker-finance-write-pause";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const guard = await requireCompanyRequestClient(request);
  if (!guard.ok) return guard.response;
  if (!(await workerFinanceSchemaReady())) return workerFinanceMaintenanceResponse();
  return Response.json({ writes: "canonical" }, { headers: { "Cache-Control": "no-store" } });
}
