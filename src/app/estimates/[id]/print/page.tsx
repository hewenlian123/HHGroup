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
import { EstimatePrintDocument } from "../../_components/estimate-print-document";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { AutoprintTrigger } from "./autoprint-trigger";
import { PrintActionBar } from "./print-action-bar";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function EstimatePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string; pdf?: string }>;
}) {
  const { id } = await params;
  const { autoprint, pdf } = await searchParams;
  const pdfCapture = pdf === "1";
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

  return (
    <div
      className={`min-h-screen bg-white text-zinc-900 print:min-h-0${pdfCapture ? " estimate-print-pdf-capture" : ""}`}
      data-read-only="true"
      data-estimate-pdf-capture={pdfCapture ? "true" : undefined}
      role="document"
      aria-label="Estimate print view"
    >
      {!pdfCapture ? <SetBreadcrumbEntityTitle label={estimate.number} /> : null}
      {!pdfCapture ? <AutoprintTrigger enabled={autoprint === "1"} /> : null}
      {!pdfCapture ? <PrintActionBar estimateId={id} /> : null}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: Letter; margin: 0; }
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
        summary={resolvedSummary}
      />
    </div>
  );
}
