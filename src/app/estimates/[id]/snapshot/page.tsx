import { notFound } from "next/navigation";
import Link from "next/link";
import { getEstimateById, getEstimateItems, getEstimateMeta, getEstimateCategories } from "@/lib/data";
import { EstimateReadOnlyContent } from "../estimate-read-only";
import { Download } from "lucide-react";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { DocumentCompanyHeader } from "@/components/documents/document-company-header";

export default async function EstimateSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estimate = await getEstimateById(id);
  if (!estimate) notFound();

  const [meta, items, categories, company] = await Promise.all([
    getEstimateMeta(id),
    getEstimateItems(id),
    getEstimateCategories(id),
    fetchDocumentCompanyProfile(),
  ]);

  const estimateCategories = [...categories].sort((a, b) => a.costCode.localeCompare(b.costCode));

  const payload = {
    estimateId: id,
    number: estimate.number,
    status: estimate.status,
    date: estimate.updatedAt,
    clientName: meta?.client.name ?? "",
    clientAddress: meta?.client.address ?? "",
    clientPhone: meta?.client.phone,
    clientEmail: meta?.client.email,
    projectName: meta?.project.name ?? "",
    projectAddress: meta?.project.siteAddress ?? "",
    items,
    estimateCategories,
  };

  return (
    <div className="min-h-screen bg-background" data-read-only="true">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .snapshot-no-print { display: none !important; }
              body { background: #fff !important; }
              @page { size: letter; margin: 0.5in; }
            }
          `,
        }}
      />
      <div className="mx-auto max-w-[1180px] flex flex-col gap-8 p-6 print:p-0 print:max-w-none">
        <header className="snapshot-no-print mb-6 flex justify-end">
          <Link
            href={`/estimates/${id}/print?autoprint=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200/60 dark:border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Link>
        </header>

        <DocumentCompanyHeader
          company={company}
          documentTitle="Estimate"
          documentNo={payload.number}
          documentDate={payload.date}
          documentNoLabel="Estimate No"
          extraRight={
            <span className="inline-block rounded-sm border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:text-foreground">
              {payload.status}
            </span>
          }
          className="border-zinc-200 dark:border-border"
        />

        <EstimateReadOnlyContent payload={payload} />
      </div>
    </div>
  );
}
