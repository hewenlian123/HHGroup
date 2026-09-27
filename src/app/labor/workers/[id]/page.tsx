import { redirect } from "next/navigation";

/** Worker profile lives under People: `/workers/[id]`. */
export default async function LaborWorkerDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { id } = await params;
  if (!id?.trim()) redirect("/workers");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value])
      query.append(key, item);
  }
  redirect(`/workers/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`);
}
