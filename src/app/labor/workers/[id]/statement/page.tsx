import { redirect } from "next/navigation";

/** Worker statement lives under People: `/workers/[id]/statement`. */
export default async function LaborWorkerStatementRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id?.trim()) redirect("/workers");
  redirect(`/workers/${encodeURIComponent(id)}/statement`);
}
