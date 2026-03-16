"use server";

import { PageLayout } from "@/components/base";
import { getAllCustomers } from "@/lib/customers-db";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const customers = await getAllCustomers();

  return (
    <PageLayout header={null}>
      <div className="page-container page-stack py-6">
        <CustomersClient initialCustomers={customers} />
      </div>
    </PageLayout>
  );
}

