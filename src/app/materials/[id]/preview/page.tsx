import { notFound } from "next/navigation";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { fetchDocumentCompanyProfile } from "@/lib/document-company-profile";
import { getMaterialSelectionSheet } from "@/lib/material-selection-sheets-db";
import { MaterialSelectionDocument } from "../material-selection-document";
import { MaterialSelectionPreviewShell } from "./material-selection-preview-shell";

export const dynamic = "force-dynamic";

export default async function MaterialSelectionPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;
  const [selection, company] = await Promise.all([
    getMaterialSelectionSheet(id),
    fetchDocumentCompanyProfile(),
  ]);
  if (!selection) notFound();

  return (
    <MaterialSelectionPreviewShell selectionId={selection.id}>
      <SetBreadcrumbEntityTitle label={`${selection.title} Preview`} />
      <MaterialSelectionDocument company={company} selection={selection} />
    </MaterialSelectionPreviewShell>
  );
}
