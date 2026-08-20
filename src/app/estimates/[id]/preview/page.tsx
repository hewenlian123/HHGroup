import { redirect } from "next/navigation";
import {
  getEstimateHeaderById,
  getEstimateItems,
  getEstimateMeta,
  getEstimateCategories,
  getEstimateSummaryFromRecords,
  getPaymentSchedule,
  getCostCodes,
} from "@/lib/data";
import { EstimatePreviewContent } from "./estimate-preview-content";
import { EstimatePreviewShell } from "./estimate-preview-shell";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import {
  buildEstimateDetailReturnHref,
  buildEstimatePreviewHref,
  readEstimateBuilderReturnContext,
} from "@/app/estimates/_components/estimate-workflow-continuity";

export const dynamic = "force-dynamic";

export default async function EstimatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnSection?: string; returnScroll?: string }>;
}) {
  const { id } = await params;
  const previewSearchParams = await searchParams;
  const readClient = getServerSupabaseInternalNoStore();

  const [estimate, meta, items, categories, paymentSchedule, costCodes, company] =
    await Promise.all([
      getEstimateHeaderById(id, readClient),
      getEstimateMeta(id, readClient),
      getEstimateItems(id, readClient),
      getEstimateCategories(id, readClient),
      getPaymentSchedule(id, readClient),
      getCostCodes(),
      fetchDocumentCompanyProfile(),
    ]);

  if (!estimate || !meta) redirect("/estimates");
  const resolvedSummary = getEstimateSummaryFromRecords(meta, items);

  const categoryList = categories;
  const catalogNameByCode = Object.fromEntries(costCodes.map((c) => [c.code, c.name]));
  const returnContext = readEstimateBuilderReturnContext(
    new URLSearchParams({
      ...(previewSearchParams.returnSection
        ? { returnSection: previewSearchParams.returnSection }
        : {}),
      ...(previewSearchParams.returnScroll
        ? { returnScroll: previewSearchParams.returnScroll }
        : {}),
    })
  );
  const returnHref = buildEstimateDetailReturnHref(id, returnContext);
  const previewHref = buildEstimatePreviewHref(id, returnContext);
  const hiddenAmountCount = items.filter((item) => item.hideAmountOnPdf).length;

  return (
    <div className="page-container page-shell-document estimate-preview-page-shell py-0">
      <SetBreadcrumbEntityTitle label={estimate.number} />
      <EstimatePreviewShell
        estimateId={id}
        estimateNumber={estimate.number}
        documentStyle={meta.documentStyle}
        hiddenAmountCount={hiddenAmountCount}
        returnHref={returnHref}
        previewHref={previewHref}
      >
        <EstimatePreviewContent
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
          summary={resolvedSummary}
        />
      </EstimatePreviewShell>
    </div>
  );
}
