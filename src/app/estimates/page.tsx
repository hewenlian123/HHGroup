import Link from "next/link";
import { unstable_noStore } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { getEstimateList } from "@/lib/data";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FlaskConical } from "lucide-react";
import { EstimateListRow, EstimateMobileList } from "./estimate-list-row";
import { deleteEstimateAction, createTestEstimateAction } from "./actions";
import { EstimateSuccessBanner } from "./[id]/estimate-success-banner";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function EstimatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  unstable_noStore();
  const { saved, error } = await searchParams;
  let list: Awaited<ReturnType<typeof getEstimateList>> = [];
  let loadWarning: string | null = null;
  try {
    list = await getEstimateList();
  } catch (e) {
    logServerPageDataError("estimates", e);
    loadWarning = serverDataLoadWarning(e, "estimates");
  }

  const errorMessage =
    error === "create"
      ? "Could not create test estimate. Is Supabase configured and estimates migrations run?"
      : error === "approve"
        ? "Estimate was created but could not set status to Approved."
        : null;

  const totalEstimates = list.length;
  const draftCount = list.filter((e) => e.status === "Draft").length;
  const sentCount = list.filter((e) => e.status === "Sent").length;
  const totalValue = list.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Estimates"
        description="Manage cost-code estimates."
        actions={
          <div className="flex items-center gap-2">
            <form action={createTestEstimateAction}>
              <Button type="submit" variant="outline" size="sm" className="rounded-sm">
                <FlaskConical className="mr-2 h-4 w-4" />
                Create test estimate
              </Button>
            </form>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="btn-outline-ghost rounded-sm text-foreground hover:bg-[#F9FAFB] dark:hover:bg-muted/30"
            >
              <Link href="/estimates/new">
                <Plus className="mr-2 h-4 w-4" />
                New Estimate
              </Link>
            </Button>
          </div>
        }
      />
      <EstimateSuccessBanner saved={saved} />
      {loadWarning && (
        <p role="status" className="border-b border-border/60 pb-3 text-sm text-muted-foreground">
          {loadWarning}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="border-b border-amber-400/50 pb-3 text-sm font-medium text-amber-800 dark:border-amber-600/50 dark:text-amber-200"
        >
          {errorMessage}
        </p>
      )}
      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Total Estimates</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{totalEstimates}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Draft</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{draftCount}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Sent</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{sentCount}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Total Value</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">
              $
              {totalValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState
          title={loadWarning ? "Could not load estimates" : "No estimates yet"}
          description={
            loadWarning
              ? "Check your connection and database configuration, then refresh."
              : "Create an estimate to get started."
          }
          icon={<FlaskConical className="h-5 w-5" />}
          action={
            <Button asChild size="sm" className="h-8">
              <Link href="/estimates/new">New Estimate</Link>
            </Button>
          }
        />
      ) : (
        <>
          <EstimateMobileList list={list} deleteAction={deleteEstimateAction} />
          <div className="hidden md:block">
            <Table className="min-w-[640px] lg:min-w-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estimate #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-0">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((row) => (
                  <EstimateListRow key={row.id} row={row} deleteAction={deleteEstimateAction} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
