"use server";

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
  await insertSubcontract(draft);
}
