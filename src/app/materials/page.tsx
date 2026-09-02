import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import {
  EmptyState,
  NeoMobileCard,
  NeoStatus,
  NeoTable,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
import { formatDate } from "@/lib/formatters";
import {
  formatMaterialSelectionStatus,
  type MaterialSelectionSheet,
} from "@/lib/material-selection-sheets";
import { listMaterialSelectionSheets } from "@/lib/material-selection-sheets-db";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { MaterialSelectionDeleteButton } from "./material-selection-delete-button";

export const dynamic = "force-dynamic";

function statusVariant(status: MaterialSelectionSheet["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "shared") return "warning" as const;
  return "muted" as const;
}

function customerProjectLine(selection: MaterialSelectionSheet): string {
  return (
    [selection.customerName, selection.projectName].filter(Boolean).join(" / ") || "Unassigned"
  );
}

export default async function MaterialSelectionsPage() {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const selections = await listMaterialSelectionSheets();

  return (
    <PageLayout
      divider={false}
      className="md:max-w-6xl"
      header={
        <PageHeader
          title="Material Selections"
          description="Customer/project material approval sheets."
          actions={
            <Button size="sm" className="h-hh-touch" asChild>
              <Link href="/materials/new">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                New Selection
              </Link>
            </Button>
          }
        />
      }
    >
      {selections.length === 0 ? (
        <EmptyState
          title="No material selections yet"
          description="Create a customer approval sheet for project finishes, fixtures, and other selected materials."
          action={
            <Button size="sm" asChild>
              <Link href="/materials/new">Create Selection</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2 md:hidden">
            {selections.map((selection) => (
              <NeoMobileCard key={selection.id} className="p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--hh-text-primary)]">
                      {selection.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--hh-text-secondary)]">
                      {selection.selectionNumber || "Draft"} · {customerProjectLine(selection)}
                    </p>
                  </div>
                  <NeoStatus
                    label={formatMaterialSelectionStatus(selection.status)}
                    variant={statusVariant(selection.status)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-11 rounded-hh-compact" asChild>
                    <Link href={`/materials/${selection.id}`}>View/Edit</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-11 rounded-hh-compact" asChild>
                    <Link href={`/materials/${selection.id}/preview`}>Preview</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-11 rounded-hh-compact" asChild>
                    <Link href={`/api/materials/${selection.id}/pdf`}>PDF</Link>
                  </Button>
                  <MaterialSelectionDeleteButton
                    id={selection.id}
                    title={selection.title}
                    className="h-11"
                  />
                </div>
              </NeoMobileCard>
            ))}
          </div>

          <NeoTable className="hidden md:block" tableClassName="min-w-[1060px]">
            <thead>
              <tr>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Selection #</th>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Title</th>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Customer</th>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Project</th>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Status</th>
                <th className={cn("h-9 px-3 text-left", TYPO.tableHeader)}>Updated</th>
                <th className={cn("h-9 w-[300px] px-3 text-right", TYPO.tableHeader)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {selections.map((selection) => (
                <tr key={selection.id} className={listTableRowStaticClassName}>
                  <td className="h-11 px-3 py-0 align-middle text-hh-table-cell font-medium tabular-nums text-[var(--hh-text-primary)]">
                    {selection.selectionNumber || "Draft"}
                  </td>
                  <td className="h-11 px-3 py-0 align-middle text-hh-table-cell font-medium text-[var(--hh-text-primary)]">
                    <Link className="hover:underline" href={`/materials/${selection.id}`}>
                      {selection.title}
                    </Link>
                  </td>
                  <td className="h-11 px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                    {selection.customerName ?? "—"}
                  </td>
                  <td className="h-11 px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                    {selection.projectName ?? "—"}
                  </td>
                  <td className="h-11 px-3 py-0 align-middle">
                    <NeoStatus
                      label={formatMaterialSelectionStatus(selection.status)}
                      variant={statusVariant(selection.status)}
                    />
                  </td>
                  <td className="h-11 px-3 py-0 align-middle text-hh-table-cell tabular-nums text-[var(--hh-text-secondary)]">
                    {formatDate(selection.updatedAt)}
                  </td>
                  <td className="h-11 px-3 py-0 text-right align-middle">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-hh-compact px-2"
                        asChild
                      >
                        <Link href={`/materials/${selection.id}`}>View/Edit</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-hh-compact px-2"
                        asChild
                      >
                        <Link href={`/materials/${selection.id}/preview`}>Preview</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-hh-compact px-2"
                        asChild
                      >
                        <Link href={`/api/materials/${selection.id}/pdf`}>PDF</Link>
                      </Button>
                      <MaterialSelectionDeleteButton id={selection.id} title={selection.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        </div>
      )}
    </PageLayout>
  );
}
