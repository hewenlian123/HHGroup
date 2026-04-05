"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { createInvoiceDraftAction } from "./actions";
import { getCompanyProfile } from "@/lib/company-profile";

type ProjectOption = { id: string; name: string };
type CustomerOption = { id: string; name: string | null };

type LineDraft = {
  description: string;
  qty: number;
  unitPrice: number;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

export default function NewInvoiceClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);

  const [projectId, setProjectId] = React.useState<string>("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [clientName, setClientName] = React.useState<string>("");

  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = React.useState<string>(today);
  const [dueDate, setDueDate] = React.useState<string>(today);
  const [taxPct, setTaxPct] = React.useState<number>(0);
  const [taxTouched, setTaxTouched] = React.useState(false);
  const [notes, setNotes] = React.useState<string>("");

  const [lines, setLines] = React.useState<LineDraft[]>([
    { description: "Item", qty: 1, unitPrice: 0 },
  ]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const load = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    const [{ data: proj, error: projErr }, { data: cust, error: custErr }] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (projErr) setError(projErr.message);
    setProjects(((proj ?? []) as ProjectOption[]).filter((p) => p.id && p.name));
    setProjectId((prev) => {
      if (prev) return prev;
      const list = (proj ?? []) as ProjectOption[];
      return list.length > 0 ? list[0].id : "";
    });

    if (custErr) {
      if (!isMissingTableError(custErr)) setError((p) => p ?? custErr.message);
      setCustomers([]);
    } else {
      setCustomers((cust ?? []) as CustomerOption[]);
    }

    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (!taxTouched && Number.isFinite(pct) && pct >= 0) setTaxPct(pct);
    } catch {
      // ignore
    }

    setLoading(false);
  }, [supabase, configured, taxTouched]);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  React.useEffect(() => {
    const selected = customers.find((c) => c.id === customerId)?.name?.trim() ?? "";
    if (customerId && selected) setClientName(selected);
  }, [customerId, customers]);

  const computedSubtotal = React.useMemo(() => {
    return lines.reduce(
      (sum, l) => sum + Math.max(0, safeNumber(l.qty)) * Math.max(0, safeNumber(l.unitPrice)),
      0
    );
  }, [lines]);
  const computedTax = React.useMemo(
    () => computedSubtotal * (Math.max(0, safeNumber(taxPct)) / 100),
    [computedSubtotal, taxPct]
  );
  const computedTotal = React.useMemo(
    () => computedSubtotal + computedTax,
    [computedSubtotal, computedTax]
  );

  const canSave =
    Boolean(projectId) &&
    clientName.trim().length > 0 &&
    lines.some((l) => l.description.trim().length > 0);

  const handleCreate = async () => {
    if (!supabase || saving || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createInvoiceDraftAction({
        projectId,
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
        lineItems: lines.map((l) => ({
          description: l.description,
          qty: Math.max(0, safeNumber(l.qty) || 0),
          unitPrice: Math.max(0, safeNumber(l.unitPrice) || 0),
        })),
      });
      if (!res.ok || !res.invoiceId) {
        const msg = res.error ?? "Failed to create invoice.";
        setError(msg);
        toast({ title: "Create invoice failed", description: msg, variant: "error" });
        return;
      }
      toast({
        title: "Invoice created",
        description: "Draft invoice created.",
        variant: "success",
      });
      router.push(`/financial/invoices/${res.invoiceId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create invoice.";
      setError(msg);
      toast({ title: "Create invoice failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[920px] flex flex-col gap-6 p-6">
      <PageHeader
        title="New Invoice"
        description="Create a draft invoice for a project and client."
      />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <Card className="p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </label>
              <select
                data-testid="invoice-new-project-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Customer (optional)
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "Unnamed customer"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client name
              </label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Issue date
                </label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate((e.target.value || issueDate).slice(0, 10))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Due date
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate((e.target.value || dueDate).slice(0, 10))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tax %
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={taxPct}
                onChange={(e) => {
                  setTaxTouched(true);
                  setTaxPct(safeNumber(e.target.value));
                }}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes (optional)
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Terms / notes"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-foreground">Line items</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }])}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-muted/20">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Description
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-[90px]">
                  Qty
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-[140px]">
                  Unit price
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-[140px]">
                  Amount
                </th>
                <th className="py-3 px-2 w-[52px]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const amount =
                  Math.max(0, safeNumber(line.qty)) * Math.max(0, safeNumber(line.unitPrice));
                return (
                  <tr key={idx} className="border-b border-zinc-100/70">
                    <td className="py-2 px-4">
                      <Input
                        value={line.description}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, description: e.target.value } : p
                            )
                          )
                        }
                        placeholder="Description"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, qty: safeNumber(e.target.value) } : p
                            )
                          )
                        }
                        className="text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, unitPrice: safeNumber(e.target.value) } : p
                            )
                          )
                        }
                        className="text-right tabular-nums"
                      />
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">
                      ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="btn-outline-ghost h-8 text-red-600 hover:text-red-700"
                        onClick={() =>
                          setLines((prev) =>
                            prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
                          )
                        }
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 flex justify-end">
          <div className="w-full max-w-sm text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                ${computedSubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            {computedTax > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxPct || 0}%)</span>
                <span className="tabular-nums">
                  ${computedTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between font-medium pt-2 border-t border-zinc-200/60">
              <span>Total</span>
              <span className="tabular-nums">
                ${computedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button onClick={handleCreate} disabled={!canSave || saving}>
          {saving ? "Creating..." : "Create draft invoice"}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/financial/invoices")}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
