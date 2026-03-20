import { redirect } from "next/navigation";
import {
  getEstimateById,
  getEstimateItems,
  getEstimateMeta,
  getEstimateCategories,
  getEstimateSummary,
  getPaymentSchedule,
  getCostCodes,
} from "@/lib/data";
import { EstimatePreviewContent } from "./estimate-preview-content";
import { EstimatePreviewShell } from "./estimate-preview-shell";

export const dynamic = "force-dynamic";

export default async function EstimatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [estimate, meta, items, categories, summary, paymentSchedule, costCodes] = await Promise.all([
    getEstimateById(id),
    getEstimateMeta(id),
    getEstimateItems(id),
    getEstimateCategories(id),
    getEstimateSummary(id),
    getPaymentSchedule(id),
    getCostCodes(),
  ]);

  if (!estimate || !meta) redirect("/estimates");

  const categoryList = [...categories].sort((a, b) => a.costCode.localeCompare(b.costCode));
  const catalogNameByCode = Object.fromEntries(costCodes.map((c) => [c.code, c.name]));

  return (
    <div className="page-container py-6">
      <EstimatePreviewShell estimateId={id} estimateNumber={estimate.number}>
        <EstimatePreviewContent
          estimate={{
            number: estimate.number,
            status: estimate.status,
            updatedAt: estimate.updatedAt,
          }}
          meta={meta}
          categories={categoryList}
          items={items}
          catalogNameByCode={catalogNameByCode}
          paymentSchedule={paymentSchedule}
          summary={summary}
        />
      </EstimatePreviewShell>
    </div>
  );
}
