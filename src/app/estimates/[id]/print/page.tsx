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
import { EstimatePrintDocument } from "../../_components/estimate-print-document";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { AutoprintTrigger } from "./autoprint-trigger";
import { PrintActionBar } from "./print-action-bar";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";

export const dynamic = "force-dynamic";

export default async function EstimatePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;

  const [estimate, meta, items, categories, summary, paymentSchedule, costCodes, company] =
    await Promise.all([
      getEstimateById(id),
      getEstimateMeta(id),
      getEstimateItems(id),
      getEstimateCategories(id),
      getEstimateSummary(id),
      getPaymentSchedule(id),
      getCostCodes(),
      fetchDocumentCompanyProfile(),
    ]);

  if (!estimate || !meta) redirect("/estimates");

  const categoryList = [...categories].sort((a, b) => a.costCode.localeCompare(b.costCode));
  const catalogNameByCode = Object.fromEntries(costCodes.map((c) => [c.code, c.name]));

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 print:min-h-0"
      data-read-only="true"
      role="document"
      aria-label="Estimate print view"
    >
      <SetBreadcrumbEntityTitle label={estimate.number} />
      <AutoprintTrigger enabled={autoprint === "1"} />
      <PrintActionBar estimateId={id} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: letter; margin: 0.5in; }
              body { background: #fff !important; }
            }
          `,
        }}
      />
      <EstimatePrintDocument
        company={company}
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
    </div>
  );
}
