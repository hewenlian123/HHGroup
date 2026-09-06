"use server";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { getDeposits, type DepositWithMeta } from "@/lib/data";
export async function loadDepositsAction(): Promise<{
  deposits: DepositWithMeta[];
  error?: string;
}> {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok) return { deposits: [], error: guard.error };
  try {
    return { deposits: await getDeposits(guard.client) };
  } catch {
    return { deposits: [], error: "Deposits are unavailable. Please retry." };
  }
}
