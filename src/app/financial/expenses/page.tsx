"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getExpenses,
  getProjects,
  getProjectById,
  getExpenseCategories,
  getExpenseTotal,
  createExpense,
  deleteExpense,
  isVendorDisabled,
  isPaymentMethodDisabled,
  type Expense,
} from "@/lib/data";
import { Plus, Trash2 } from "lucide-react";

const MAX_SUMMARY_LEN = 40;

function splitSummary(expense: Expense): string {
  const byProject = new Map<string | null, number>();
  for (const line of expense.lines) {
    const key = line.projectId;
    byProject.set(key, (byProject.get(key) ?? 0) + line.amount);
  }
  const parts: string[] = [];
  Array.from(byProject.entries()).forEach(([projectId, amount]) => {
    const label = projectId == null ? "Overhead" : (getProjectById(projectId)?.name ?? projectId);
    parts.push(`${label} $${amount.toLocaleString()}`);
  });
  return parts.join(" • ");
}

export default function ExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = React.useState<Expense[]>(() => getExpenses());
  const [search, setSearch] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("");

  const projects = getProjects();
  const categoriesList = getExpenseCategories();

  const filtered = React.useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.vendorName.toLowerCase().includes(q) ||
          (e.referenceNo?.toLowerCase().includes(q)) ||
          e.lines.some((l) => (l.memo ?? "").toLowerCase().includes(q))
      );
    }
    if (projectFilter) list = list.filter((e) => e.lines.some((l) => l.projectId === projectFilter));
    if (categoryFilter) list = list.filter((e) => e.lines.some((l) => l.category === categoryFilter));
    return list;
  }, [expenses, search, projectFilter, categoryFilter]);

  const refresh = React.useCallback(() => {
    setExpenses(getExpenses());
  }, []);

  const handleNew = () => {
    const created = createExpense({});
    router.push(`/financial/expenses/${created.id}`);
  };

  const handleDelete = (expense: Expense) => {
    if (typeof window !== "undefined" && window.confirm("Delete this expense?")) {
      expense.attachments?.forEach((a) => {
        if (a.url?.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
      deleteExpense(expense.id);
      refresh();
    }
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Expenses"
        description="Internal owner view. Split lines by project and category."
        actions={
          <Button onClick={handleNew} className="rounded-lg">
            <Plus className="h-4 w-4 mr-2" />
            New Expense
          </Button>
        }
      />

      <section>
        <Card className="rounded-2xl border border-zinc-200/40 dark:border-border p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Search</label>
              <Input
                placeholder="Vendor, ref, memo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All categories</option>
                {categoriesList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </section>

      <section>
        <Card className="rounded-2xl border border-zinc-200/40 dark:border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-zinc-200/40 dark:border-border/60 hover:bg-transparent bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Vendor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Payment</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">Total</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-center tabular-nums">#Lines</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Split Summary</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const total = getExpenseTotal(row);
                  const summary = splitSummary(row);
                  const truncated = summary.length > MAX_SUMMARY_LEN ? summary.slice(0, MAX_SUMMARY_LEN - 3) + "..." : summary;
                  return (
                    <TableRow
                      key={row.id}
                      className="border-b border-zinc-100/50 dark:border-border/30"
                    >
                      <TableCell className="tabular-nums text-foreground">{row.date}</TableCell>
                      <TableCell className="text-foreground">
                        <span>{row.vendorName}</span>
                        {row.vendorName && isVendorDisabled(row.vendorName) && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">Disabled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span>{row.paymentMethod}</span>
                        {row.paymentMethod && isPaymentMethodDisabled(row.paymentMethod) && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">Disabled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-red-600/90 dark:text-red-400/90">
                        −${total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">{row.lines.length}</TableCell>
                      <TableCell className="text-muted-foreground text-sm" title={summary}>
                        {truncated || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/financial/expenses/${row.id}`}>View</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(row)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>
    </div>
  );
}
