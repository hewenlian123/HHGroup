import { redirect } from "next/navigation";

/** Print view lives under People: `/workers/[id]/statement/print`. */
export default async function LaborWorkerStatementPrintRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ start?: string; end?: string; project?: string }>;
}) {
  const { id } = await params;
  if (!id?.trim()) redirect("/workers");
  const qs = (await searchParams) ?? {};
  const u = new URLSearchParams();
  if (qs.start) u.set("start", qs.start);
  if (qs.end) u.set("end", qs.end);
  if (qs.project) u.set("project", qs.project);
  const tail = u.toString();
  redirect(`/workers/${encodeURIComponent(id)}/statement/print${tail ? `?${tail}` : ""}`);
}
