import { redirect } from "next/navigation";

/** Worker profile lives under People: `/workers/[id]`. */
export default async function LaborWorkerDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id?.trim()) redirect("/workers");
  redirect(`/workers/${encodeURIComponent(id)}`);
}
