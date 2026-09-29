import { notFound, redirect } from "next/navigation";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";

export const dynamic = "force-dynamic";

export default async function ProjectClientReimbursementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const guard = await requireOrganizationServerActionClient({ projectId: id, noStore: true });
  if (!guard.ok) notFound();
  redirect(`/financial/client-reimbursements?project_id=${encodeURIComponent(id)}`);
}
