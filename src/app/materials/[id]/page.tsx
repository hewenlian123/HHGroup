import { notFound } from "next/navigation";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { requireOrganizationServerActionClient } from "@/lib/auth-boundary";
import { getMaterialSelectionSheet } from "@/lib/material-selection-sheets-db";
import { MaterialSelectionDetailClient } from "./material-selection-detail-client";

export const dynamic = "force-dynamic";

export default async function MaterialSelectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guard = await requireOrganizationServerActionClient({ noStore: true });
  if (!guard.ok) notFound();
  const { id } = await params;
  const selection = await getMaterialSelectionSheet(id, guard.client);
  if (!selection) notFound();

  return (
    <>
      <SetBreadcrumbEntityTitle label={selection.title} />
      <MaterialSelectionDetailClient selection={selection} />
    </>
  );
}
