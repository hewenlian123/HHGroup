import { PageLayout } from "@/components/base";
import { getAllCustomers } from "@/lib/customers-db";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { CustomersClient } from "./customers-client";

/** Avoid DB access during `next build` when CI uses placeholder Supabase env. */
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  let customers: Awaited<ReturnType<typeof getAllCustomers>> = [];
  let dataLoadWarning: string | null = null;
  try {
    customers = await getAllCustomers();
  } catch (e) {
    logServerPageDataError("customers", e);
    dataLoadWarning = serverDataLoadWarning(e, "customers");
  }

  return (
    <PageLayout header={null}>
      <div className="page-stack py-6">
        <CustomersClient initialCustomers={customers} dataLoadWarning={dataLoadWarning} />
      </div>
    </PageLayout>
  );
}
