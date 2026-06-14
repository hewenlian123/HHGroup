import Link from "next/link";
import { notFound } from "next/navigation";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { getMaterialSelectionSheet } from "@/lib/material-selection-sheets-db";
import { MaterialSelectionDocument } from "../material-selection-document";

export const dynamic = "force-dynamic";

export default async function MaterialSelectionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { id } = await params;
  const { pdf } = await searchParams;
  const pdfCapture = pdf === "1";
  const [selection, company] = await Promise.all([
    getMaterialSelectionSheet(id),
    fetchDocumentCompanyProfile(),
  ]);
  if (!selection) notFound();

  return (
    <div className="material-selection-a4-shell min-h-screen bg-white px-3 py-5 text-black sm:px-6 print:p-0">
      {!pdfCapture ? <SetBreadcrumbEntityTitle label={`${selection.title} Print`} /> : null}
      <MaterialSelectionDocument company={company} selection={selection} />
      {!pdfCapture ? (
        <p className="no-print mt-6 text-center text-xs text-zinc-500 print:hidden">
          <Link href={`/materials/${selection.id}`} className="text-blue-600 underline">
            View in app
          </Link>
        </p>
      ) : null}
    </div>
  );
}
