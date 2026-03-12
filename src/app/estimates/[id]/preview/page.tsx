import { redirect } from "next/navigation";
import {
  getEstimateById,
  getEstimateItems,
  getEstimateMeta,
  getEstimateCategories,
  getEstimateSummary,
  getPaymentSchedule,
  type EstimateItemRow,
} from "@/lib/data";
import { EstimatePreviewContent } from "./estimate-preview-content";

export const dynamic = "force-dynamic";

export default async function EstimatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [estimate, meta, items, categories, summary, paymentSchedule] = await Promise.all([
    getEstimateById(id),
    getEstimateMeta(id),
    getEstimateItems(id),
    getEstimateCategories(id),
    getEstimateSummary(id),
    getPaymentSchedule(id),
  ]);

  if (!estimate || !meta) redirect("/estimates");

  const categoryList = [...categories].sort((a, b) => a.costCode.localeCompare(b.costCode));
  const itemsByCode: Record<string, EstimateItemRow[]> = {};
  for (const item of items) {
    if (!itemsByCode[item.costCode]) itemsByCode[item.costCode] = [];
    itemsByCode[item.costCode].push(item);
  }

  return (
    <div className="page-container py-6">
      <EstimatePreviewContent
        estimateId={id}
        estimate={{
          number: estimate.number,
          status: estimate.status,
          updatedAt: estimate.updatedAt,
        }}
        meta={meta}
        categories={categoryList}
        itemsByCode={itemsByCode}
        paymentSchedule={paymentSchedule}
        summary={summary}
      />
    </div>
  );
}
