import { requireSupabaseOwnerOrAdminServerActionClient } from "@/lib/auth-boundary";
import { getAllCustomers } from "@/lib/customers-db";
import { getSubcontractors } from "@/lib/subcontractors-db";
import { ContactsDirectory, type ContactGroup } from "@/components/contacts/contacts-directory";
import { logServerPageDataError } from "@/lib/server-load-warning";

export const dynamic = "force-dynamic";
export default async function ContactsOverviewPage() {
  const guard = await requireSupabaseOwnerOrAdminServerActionClient({ noStore: true });
  const [customers, subcontractors] = await Promise.allSettled([
    guard.ok ? getAllCustomers() : Promise.reject(new Error(guard.error)),
    guard.ok ? getSubcontractors(guard.client) : Promise.reject(new Error(guard.error)),
  ]);
  for (const result of [customers, subcontractors])
    if (result.status === "rejected") logServerPageDataError("contacts", result.reason);
  const groups: ContactGroup[] = [
    {
      role: "Customer",
      entries:
        customers.status === "fulfilled"
          ? customers.value.map((c) => ({
              id: c.id,
              name: c.name,
              company: c.company_name,
              contact: c.contact_person,
              phone: c.phone,
              email: c.email,
              status: c.status ?? "active",
              createdAt: c.created_at,
              href: `/customers/${c.id}`,
            }))
          : null,
    },
    {
      role: "Subcontractor",
      entries:
        subcontractors.status === "fulfilled"
          ? subcontractors.value.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              email: c.email,
              status: c.active ? "active" : "inactive",
              createdAt: c.created_at,
              href: `/subcontractors/${c.id}`,
            }))
          : null,
    },
  ];
  return <ContactsDirectory groups={groups} />;
}
