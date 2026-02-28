import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getEstimateById,
  getEstimateItems,
  getEstimateMeta,
} from "@/lib/data";
import { EstimateReadOnlyContent } from "../estimate-read-only";
import { Download } from "lucide-react";

export default async function EstimateSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estimate = getEstimateById(id);
  if (!estimate) notFound();

  const meta = getEstimateMeta(id);
  const items = getEstimateItems(id);

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
        {/* Top bar: Estimate #, Status, Date, Client, Project, Address — only Download PDF button */}
        <header className="snapshot-no-print flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:flex print:flex-row print:justify-between print:border-b print:pb-4 print:mb-6">
          <div className="grid grid-cols-1 gap-2 text-sm min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-foreground">Estimate #{payload.number}</span>
              <span className="rounded border border-zinc-300 dark:border-zinc-600 px-2 py-0.5 text-xs font-medium text-foreground">
                {payload.status}
              </span>
              <span className="text-muted-foreground">Date: {payload.date}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">{payload.clientName}</span>
              {payload.clientAddress && ` · ${payload.clientAddress}`}
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">{payload.projectName}</span>
              {payload.projectAddress && ` · ${payload.projectAddress}`}
            </div>
          </div>
          <div className="snapshot-no-print flex-shrink-0">
            <Link
              href={`/estimates/${id}/print?autoprint=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200/60 dark:border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Link>
          </div>
        </header>

        <EstimateReadOnlyContent payload={payload} />
      </div>
    </div>
  );
}
