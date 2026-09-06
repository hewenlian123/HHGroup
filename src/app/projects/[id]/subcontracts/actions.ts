"use server";

import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import { insertSubcontract } from "@/lib/data";

export async function addSubcontractAction(draft: {
  project_id: string;
  subcontractor_id: string;
  cost_code?: string | null;
  contract_amount: number;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}) {
  const guard = await requireOrganizationServerActionClient({
    projectId: draft.project_id,
    write: true,
    requireOwnerAdmin: true,
    noStore: true,
  });
  if (!guard.ok) throw new Error(guard.error);
  await insertSubcontract(draft, guard.client);
}
