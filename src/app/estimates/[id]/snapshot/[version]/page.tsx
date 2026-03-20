import { notFound } from "next/navigation";
import { getCostCodes, getEstimateSnapshot } from "@/lib/data";
import { EstimateEditor } from "@/app/estimates/_components/estimate-editor";

export const dynamic = "force-dynamic";

export default async function EstimateSnapshotPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  const v = Number(version);
  if (!Number.isFinite(v) || v <= 0) notFound();

  const [snapshot, costCodes] = await Promise.all([
    getEstimateSnapshot(id, v),
    getCostCodes(),
  ]);
  if (!snapshot || !snapshot.meta) notFound();

  const summary = snapshot.summary
    ? {
        materialCost: snapshot.summary.materialCost,
        laborCost: snapshot.summary.laborCost,
        subcontractorCost: snapshot.summary.subcontractorCost,
        subtotal: snapshot.summary.subtotal,
        tax: snapshot.summary.tax,
        discount: snapshot.summary.discount,
        markup: snapshot.summary.markup,
        grandTotal: snapshot.summary.total,
        overheadPct: snapshot.meta.overheadPct,
        profitPct: snapshot.meta.profitPct,
        overhead: snapshot.summary.subtotal * snapshot.meta.overheadPct,
        profit: snapshot.summary.subtotal * snapshot.meta.profitPct,
      }
    : null;

  const categoryNames = snapshot.meta.categoryNames ?? {};
  const sortedKeys = Object.keys(categoryNames).sort((a, b) => a.localeCompare(b));
  const estimateCategories = sortedKeys.map((costCode, i) => ({
    costCode,
    displayName: categoryNames[costCode] ?? costCode,
    orderIndex: i,
  }));

  return (
    <div className="page-container page-stack py-6" data-read-only="true">
      <EstimateEditor
        estimateId={id}
        estimateNumber={`v${snapshot.version}`}
        status={snapshot.statusAtSnapshot}
        meta={snapshot.meta}
        items={snapshot.items}
        estimateCategories={estimateCategories}
        categoryNames={categoryNames}
        costCodes={costCodes}
        summary={summary}
        paymentSchedule={[]}
        paymentTemplates={[]}
        editing={false}
      />
    </div>
  );
}
