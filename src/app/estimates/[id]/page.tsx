import { redirect } from "next/navigation";
import { getEstimateById, getEstimateMeta, getEstimateItems, getEstimateCategories, getEstimateSummary, getCostCodes, getPaymentSchedule, listPaymentTemplates } from "@/lib/data";
import { EstimateDetailClient } from "./estimate-detail-client";
import { EstimateSuccessBanner } from "./estimate-success-banner";

export const dynamic = "force-dynamic";

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { created, saved } = await searchParams;
  const [estimate, meta, items, categories, summary, costCodes, paymentSchedule, paymentTemplates] = await Promise.all([
    getEstimateById(id),
    getEstimateMeta(id),
    getEstimateItems(id),
    getEstimateCategories(id),
    getEstimateSummary(id),
    getCostCodes(),
    getPaymentSchedule(id),
    listPaymentTemplates(),
  ]);

  if (!estimate || !meta) redirect("/estimates");

  const categoryNames = categories.reduce<Record<string, string>>((acc, c) => {
    acc[c.costCode] = c.displayName;
    return acc;
  }, {});

  return (
    <div className="page-container page-stack py-6">
      <EstimateDetailClient
        estimateId={id}
        estimateNumber={estimate.number}
        initialStatus={estimate.status}
        meta={meta}
        items={items}
        categoryNames={categoryNames}
        costCodes={costCodes}
        summary={summary}
        paymentSchedule={paymentSchedule}
        paymentTemplates={paymentTemplates}
      />
      <EstimateSuccessBanner created={created} saved={saved} />
    </div>
  );
}
