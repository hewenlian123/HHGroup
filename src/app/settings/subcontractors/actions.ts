"use server";

import { insertSubcontractor } from "@/lib/data";

export async function addSubcontractorAction(draft: {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active?: boolean;
  insurance_expiration_date?: string | null;
  notes?: string | null;
}) {
  await insertSubcontractor(draft);
}
