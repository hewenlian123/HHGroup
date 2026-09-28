import AccountsClient from "./accounts-client";
import { getCashOverview, type CashOverview } from "@/lib/data";
import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { PermissionDenied } from "@/components/ui/system-state";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  if (!guard.ok)
    return (
      <div className="page-container py-6">
        <PermissionDenied description={guard.error} />
      </div>
    );
  let cashOverview: CashOverview | null = null;
  try {
    cashOverview = await getCashOverview(guard.client);
  } catch {
    // Unavailable is distinct from a successful empty ledger.
  }
  return <AccountsClient cashOverview={cashOverview} />;
}
