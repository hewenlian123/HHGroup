import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyLaborSubcontractorDetailPage({ params }: Props) {
  // Legacy duplicate route. Canonical subcontractor detail is `/subcontractors/[id]`.
  const { id } = await params;
  redirect(`/subcontractors/${id}`);
}
