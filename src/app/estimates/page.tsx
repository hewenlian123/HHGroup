import { unstable_noStore } from "next/cache";
import { getEstimateList } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { deleteEstimateAction, createTestEstimateAction } from "./actions";
import { EstimatesListClient } from "./estimates-list-client";

export const dynamic = "force-dynamic";

export default async function EstimatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  unstable_noStore();
  const { saved, error } = await searchParams;
  let list: Awaited<ReturnType<typeof getEstimateList>> = [];
  let loadWarning: string | null = null;
  try {
    list = await getEstimateList();
  } catch (e) {
    logServerPageDataError("estimates", e);
    loadWarning = serverDataLoadWarning(e, "estimates");
  }

  const errorMessage =
    error === "create"
      ? "Could not create test estimate. Is Supabase configured and estimates migrations run?"
      : error === "approve"
        ? "Estimate was created but could not set status to Approved."
        : null;

  return (
    <EstimatesListClient
      list={list}
      loadWarning={loadWarning}
      saved={saved}
      errorMessage={errorMessage}
      deleteEstimateAction={deleteEstimateAction}
      createTestEstimateAction={createTestEstimateAction}
    />
  );
}
