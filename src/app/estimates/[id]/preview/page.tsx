import { redirect } from "next/navigation";
import {
  getEstimateHeaderById,
  getEstimateItems,
  getEstimateMeta,
  getEstimateCategories,
  getEstimateSummaryFromRecords,
  getPaymentSchedule,
  getCostCodes,
  getEstimateRevisionContext,
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

  const [estimate, meta, items, categories, paymentSchedule, costCodes, company, revisionContext] =
    await Promise.all([
      getEstimateHeaderById(id, readClient),
      getEstimateMeta(id, readClient),
      getEstimateItems(id, readClient),
      getEstimateCategories(id, readClient),
      getPaymentSchedule(id, readClient),
      getCostCodes(),
      fetchDocumentCompanyProfile(),
      readClient ? getEstimateRevisionContext(id, readClient).catch(() => null) : null,
    ]);

  if (!estimate || !meta || !revisionContext) redirect("/estimates");
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
  const revisionLabel = `${estimate.number} Rev ${revisionContext.revisionNumber}`;

  return (
    <div
      className="page-container page-shell-document estimate-preview-page-shell py-0"
      data-hh-context="viewer"
      data-hh-theme="neo-dark"
    >
      <SetBreadcrumbEntityTitle label={revisionLabel} />
      <EstimatePreviewShell
        estimateId={id}
        estimateNumber={revisionLabel}
        documentStyle={meta.documentStyle}
        hiddenAmountCount={hiddenAmountCount}
        returnHref={returnHref}
        previewHref={previewHref}
        revisionContext={revisionContext}
      >
        <EstimatePreviewContent
          company={company}
          estimate={{
            number: revisionLabel,
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
