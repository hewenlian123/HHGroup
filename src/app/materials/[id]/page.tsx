import { notFound } from "next/navigation";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { getMaterialSelectionSheet } from "@/lib/material-selection-sheets-db";
import { MaterialSelectionDetailClient } from "./material-selection-detail-client";

export const dynamic = "force-dynamic";

export default async function MaterialSelectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const selection = await getMaterialSelectionSheet(id);
  if (!selection) notFound();

  return (
    <>
      <SetBreadcrumbEntityTitle label={selection.title} />
      <MaterialSelectionDetailClient selection={selection} />
    </>
  );
}
