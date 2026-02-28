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
  getInvoicesWithDerived,
  getProjects,
  getProjectById,
  duplicateInvoice,
  voidInvoice,
  type InvoiceWithDerived,
  type InvoiceStatus,
} from "@/lib/data";
import { Plus, Eye, CreditCard, Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

const STATUS_OPTIONS: { value: "" | InvoiceStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "Draft", label: "Draft" },
  { value: "Sent", label: "Sent" },
  { value: "Partially Paid", label: "Partially Paid" },
  { value: "Paid", label: "Paid" },
  { value: "Void", label: "Void" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = React.useState<InvoiceWithDerived[]>(() => getInvoicesWithDerived());
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | InvoiceStatus>("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);

  const projects = getProjects();

  const filtered = React.useMemo(() => {
    let list = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNo.toLowerCase().includes(q) ||
          i.clientName.toLowerCase().includes(q) ||
          (getProjectById(i.projectId)?.name ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((i) => i.computedStatus === statusFilter);
    if (projectFilter) list = list.filter((i) => i.projectId === projectFilter);
    return list;
  }, [invoices, search, statusFilter, projectFilter]);

  const refresh = React.useCallback(() => {
    setInvoices(getInvoicesWithDerived());
    setVoidConfirmId(null);
  }, []);

  const handleVoid = (id: string) => {
    voidInvoice(id);
    refresh();
  };

  const handleDuplicate = (id: string) => {
    const dup = duplicateInvoice(id);
    if (dup) router.push(`/financial/invoices/${dup.id}`);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Invoices"
        subtitle="Create and manage invoices. Record payments and track AR."
        actions={
          <Button asChild className="rounded-lg" size="sm">
            <Link href="/financial/invoices/new">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Link>
          </Button>
        }
      />
      <FilterBar className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search invoice #, client, project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-[10px] max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceStatus)}
            className="flex h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="flex h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoice #</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Project</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Client</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Issue</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Due</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Paid</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Balance</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No invoices match filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.id} className="group border-b border-zinc-100/50 dark:border-border/30">
                    <TableCell className="font-medium">
                      <Link href={`/financial/invoices/${inv.id}`} className="text-primary hover:underline">
                        {inv.invoiceNo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{getProjectById(inv.projectId)?.name ?? inv.projectId}</TableCell>
                    <TableCell className="text-foreground">{inv.clientName}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{inv.issueDate}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{inv.dueDate}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${inv.total.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600/90 dark:text-emerald-400/90">${inv.paidTotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${inv.balanceDue.toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={inv.computedStatus} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                        <Button asChild variant="ghost" size="sm" className="h-8">
                          <Link href={`/financial/invoices/${inv.id}`}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Link>
                        </Button>
                        {inv.computedStatus !== "Void" && inv.computedStatus !== "Paid" && (
                          <Button asChild variant="ghost" size="sm" className="h-8">
                            <Link href={`/financial/invoices/${inv.id}?recordPayment=1`}>
                              <CreditCard className="h-4 w-4 mr-1" /> Record Payment
                            </Link>
                          </Button>
                        )}
                        {inv.computedStatus !== "Void" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => handleDuplicate(inv.id)}
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {inv.computedStatus !== "Void" && (
                          voidConfirmId === inv.id ? (
                            <>
                              <Button variant="destructive" size="sm" className="h-8" onClick={() => handleVoid(inv.id)}>
                                Confirm Void
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8" onClick={() => setVoidConfirmId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-red-600 hover:text-red-700"
                              onClick={() => setVoidConfirmId(inv.id)}
                              title="Void"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
