"use server";

import { insertSubcontractor } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";

export async function addSubcontractorAction(draft: {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active?: boolean;
  insurance_expiration_date?: string | null;
  notes?: string | null;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) throw new Error(guard.error);
  await insertSubcontractor(draft, guard.client);
}
