import Link from "next/link";
import { unstable_noStore } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { getEstimateList } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FlaskConical } from "lucide-react";
import { EstimateListRow } from "./estimate-list-row";
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
  const list = await getEstimateList();

  const errorMessage =
    error === "create"
      ? "Could not create test estimate. Is Supabase configured and estimates migrations run?"
      : error === "approve"
        ? "Estimate was created but could not set status to Approved."
        : null;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Estimates"
        description="Manage cost-code estimates."
        actions={
          <div className="flex items-center gap-2">
            <form action={createTestEstimateAction}>
              <Button type="submit" variant="outline" size="default" className="rounded-lg">
                <FlaskConical className="h-4 w-4 mr-2" />
                Create test estimate
              </Button>
            </form>
            <Button asChild variant="ghost" className="rounded-lg text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800" size="default">
              <Link href="/estimates/new">
                <Plus className="h-4 w-4 mr-2" />
                New Estimate
              </Link>
            </Button>
          </div>
        }
      />
      <EstimateSuccessBanner saved={saved} />
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {errorMessage}
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState
          title="No estimates yet"
          description="Create an estimate to get started."
          icon={<FlaskConical className="h-5 w-5" />}
          action={
            <Button asChild size="sm" className="h-8">
              <Link href="/estimates/new">New Estimate</Link>
            </Button>
          }
        />
      ) : (
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-200/40 dark:border-border/60 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Estimate #</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Project</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium text-right tabular-nums">Total</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Updated</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium w-0">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <EstimateListRow key={row.id} row={row} deleteAction={deleteEstimateAction} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
