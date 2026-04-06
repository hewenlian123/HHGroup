"use client";

import * as React from "react";
import { SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import type { CloseoutPunch, CloseoutWarranty, CloseoutCompletion } from "@/lib/data";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProjectCloseoutTab({
  projectId,
  projectName,
  billingSummary,
  contractValue,
  punch,
  warranty,
  completion,
  onRefresh,
}: {
  projectId: string;
  projectName: string;
  billingSummary: { invoicedTotal: number; paidTotal: number; arBalance: number };
  contractValue: number;
  punch: CloseoutPunch | null;
  warranty: CloseoutWarranty | null;
  completion: CloseoutCompletion | null;
  onRefresh: () => void;
}) {
  const [punchForm, setPunchForm] = React.useState({
    inspection_date: punch?.inspection_date ?? "",
    inspector: punch?.inspector ?? "",
    notes: punch?.notes ?? "",
    contractor_signature: punch?.contractor_signature ?? "",
    client_signature: punch?.client_signature ?? "",
    items: punch?.items ?? ([] as { item: string; status: "pending" | "done" }[]),
  });
  const [warrantyForm, setWarrantyForm] = React.useState({
    start_date: warranty?.start_date ?? "",
    period_months: warranty?.period_months ?? 12,
    notes: warranty?.notes ?? "",
  });
  const [completionForm, setCompletionForm] = React.useState({
    completion_date: completion?.completion_date ?? "",
    contractor_name: completion?.contractor_name ?? "",
    client_name: completion?.client_name ?? "",
    contractor_signature: completion?.contractor_signature ?? "",
    client_signature: completion?.client_signature ?? "",
  });
  const [saving, setSaving] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (punch) {
      setPunchForm({
        inspection_date: punch.inspection_date ?? "",
        inspector: punch.inspector ?? "",
        notes: punch.notes ?? "",
        contractor_signature: punch.contractor_signature ?? "",
        client_signature: punch.client_signature ?? "",
        items: punch.items ?? [],
      });
    }
  }, [punch]);
  React.useEffect(() => {
    if (warranty) {
      setWarrantyForm({
        start_date: warranty.start_date ?? "",
        period_months: warranty.period_months ?? 12,
        notes: warranty.notes ?? "",
      });
    }
  }, [warranty]);
  React.useEffect(() => {
    if (completion) {
      setCompletionForm({
        completion_date: completion.completion_date ?? "",
        contractor_name: completion.contractor_name ?? "",
        client_name: completion.client_name ?? "",
        contractor_signature: completion.contractor_signature ?? "",
        client_signature: completion.client_signature ?? "",
      });
    }
  }, [completion]);

  const warrantyExpiration = React.useMemo(() => {
    if (!warrantyForm.start_date || !warrantyForm.period_months) return null;
    const d = new Date(warrantyForm.start_date);
    d.setMonth(d.getMonth() + warrantyForm.period_months);
    return d.toISOString().slice(0, 10);
  }, [warrantyForm.start_date, warrantyForm.period_months]);

  const savePunch = async () => {
    setSaving("punch");
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_date: punchForm.inspection_date || null,
          inspector: punchForm.inspector || null,
          notes: punchForm.notes || null,
          contractor_signature: punchForm.contractor_signature || null,
          client_signature: punchForm.client_signature || null,
          items: punchForm.items,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Save failed");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveWarranty = async () => {
    setSaving("warranty");
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/warranty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: warrantyForm.start_date || null,
          period_months: warrantyForm.period_months,
          notes: warrantyForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Save failed");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const saveCompletion = async () => {
    setSaving("completion");
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_date: completionForm.completion_date || null,
          contractor_name: completionForm.contractor_name || null,
          client_name: completionForm.client_name || null,
          contractor_signature: completionForm.contractor_signature || null,
          client_signature: completionForm.client_signature || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Save failed");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const generatePunchPdf = async () => {
    setGenerating("punch-pdf");
    setMessage(null);
    try {
      await savePunch();
      const res = await fetch(`/api/projects/${projectId}/closeout/generate-punch-pdf`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "PDF failed");
      onRefresh();
      setMessage("PDF saved to project documents.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setGenerating(null);
    }
  };

  const createFinalInvoicePdf = async () => {
    setGenerating("final-invoice");
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/generate-final-invoice-pdf`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "PDF failed");
      onRefresh();
      setMessage("Final invoice PDF saved to project documents.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setGenerating(null);
    }
  };

  const generateCompletionPdf = async () => {
    setGenerating("completion-pdf");
    setMessage(null);
    try {
      await saveCompletion();
      const res = await fetch(`/api/projects/${projectId}/closeout/generate-completion-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          completion_date: completionForm.completion_date,
          contractor_name: completionForm.contractor_name,
          client_name: completionForm.client_name,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "PDF failed");
      onRefresh();
      setMessage("Completion certificate PDF saved to project documents.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setGenerating(null);
    }
  };

  const addPunchItem = () => {
    setPunchForm((p) => ({ ...p, items: [...p.items, { item: "", status: "pending" }] }));
  };
  const updatePunchItem = (idx: number, field: "item" | "status", value: string) => {
    setPunchForm((p) => ({
      ...p,
      items: p.items.map((x, i) =>
        i === idx
          ? { ...x, [field]: field === "status" ? (value as "pending" | "done") : value }
          : x
      ),
    }));
  };
  const removePunchItem = (idx: number) => {
    setPunchForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const remainingBalance = Math.max(0, contractValue - billingSummary.paidTotal);

  return (
    <div className="max-w-4xl space-y-8">
      {message && (
        <p
          className={cn(
            "text-sm",
            message.startsWith("PDF") ? "text-hh-profit-positive" : "text-red-600"
          )}
        >
          {message}
        </p>
      )}

      {/* 1. Final Punch List — printable form */}
      <div className="final-punch-print border-b border-border/60 pb-6">
        <SectionHeader label="Final Punch List" />
        <div className="mt-3 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <p className="mt-1 text-sm font-medium text-foreground">{projectName}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection date</label>
              <Input
                type="date"
                value={punchForm.inspection_date}
                onChange={(e) => setPunchForm((p) => ({ ...p, inspection_date: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspector</label>
              <Input
                value={punchForm.inspector}
                onChange={(e) => setPunchForm((p) => ({ ...p, inspector: e.target.value }))}
                placeholder="Inspector name"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Items checklist</label>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Add and track items</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-sm no-print"
                onClick={addPunchItem}
              >
                + Add item
              </Button>
            </div>
            <div className="airtable-table-wrap airtable-table-wrap--ruled mt-2">
              <div className="airtable-table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="h-8 px-2 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Item
                      </th>
                      <th className="h-8 w-24 px-2 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                        Status
                      </th>
                      <th className="h-8 w-16 no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {punchForm.items.map((row, idx) => (
                      <tr key={idx} className={listTableRowStaticClassName}>
                        <td className="min-h-[44px] px-2 py-1.5 align-middle">
                          <Input
                            value={row.item}
                            onChange={(e) => updatePunchItem(idx, "item", e.target.value)}
                            className="h-9 rounded-sm border-border/60 text-sm"
                          />
                        </td>
                        <td className="min-h-[44px] px-2 py-1.5 align-middle">
                          <select
                            value={row.status}
                            onChange={(e) => updatePunchItem(idx, "status", e.target.value)}
                            className="h-9 w-full rounded-sm border border-border/60 bg-background text-sm"
                          >
                            <option value="pending">Pending</option>
                            <option value="done">Done</option>
                          </select>
                        </td>
                        <td className="min-h-[44px] px-2 py-1.5 align-middle no-print">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-9 text-destructive"
                            onClick={() => removePunchItem(idx)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={punchForm.notes}
              onChange={(e) => setPunchForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Owner signature</label>
              <Input
                value={punchForm.client_signature}
                onChange={(e) => setPunchForm((p) => ({ ...p, client_signature: e.target.value }))}
                placeholder="Name or signed"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Contractor signature
              </label>
              <Input
                value={punchForm.contractor_signature}
                onChange={(e) =>
                  setPunchForm((p) => ({ ...p, contractor_signature: e.target.value }))
                }
                placeholder="Name or signed"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
          </div>
          <div className="flex gap-2 no-print">
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm"
              onClick={savePunch}
              disabled={saving === "punch"}
            >
              <SubmitSpinner loading={saving === "punch"} className="mr-2" />
              {saving === "punch" ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
              onClick={generatePunchPdf}
              disabled={!!generating}
            >
              {generating === "punch-pdf" ? "Generating…" : "Generate PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Warranty Information */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <SectionHeader label="Warranty Information" />
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Start date
              </label>
              <Input
                type="date"
                value={warrantyForm.start_date}
                onChange={(e) => setWarrantyForm((p) => ({ ...p, start_date: e.target.value }))}
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Period (months)
              </label>
              <Input
                type="number"
                min={1}
                value={warrantyForm.period_months}
                onChange={(e) =>
                  setWarrantyForm((p) => ({
                    ...p,
                    period_months: parseInt(e.target.value, 10) || 12,
                  }))
                }
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
          </div>
          {warrantyExpiration && (
            <p className="text-sm text-text-secondary">
              <span className="font-medium">Warranty expiration:</span>{" "}
              {new Date(warrantyExpiration).toLocaleDateString()}
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={warrantyForm.notes}
              onChange={(e) => setWarrantyForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-100 px-3 py-2 text-sm"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={saveWarranty}
            disabled={saving === "warranty"}
          >
            <SubmitSpinner loading={saving === "warranty"} className="mr-2" />
            {saving === "warranty" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* 3. Final Invoice */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <SectionHeader label="Final Invoice" />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Contract value</span>
            <span className="font-medium tabular-nums">${fmtUsd(contractValue)}</span>
          </div>
          <Divider />
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Payments received</span>
            <span className="font-medium tabular-nums">${fmtUsd(billingSummary.paidTotal)}</span>
          </div>
          <Divider />
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Remaining balance</span>
            <span className="font-medium tabular-nums">${fmtUsd(remainingBalance)}</span>
          </div>
          <div className="pt-2">
            <Button
              size="sm"
              className="rounded-lg bg-black text-white hover:bg-black/90"
              onClick={createFinalInvoicePdf}
              disabled={!!generating}
            >
              {generating === "final-invoice" ? "Generating…" : "Create Final Invoice"}
            </Button>
          </div>
        </div>
      </div>

      {/* 4. Completion Certificate */}
      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <SectionHeader label="Completion Certificate" />
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Project
            </label>
            <p className="mt-1 text-sm font-medium text-text-primary">{projectName}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Completion date
            </label>
            <Input
              type="date"
              value={completionForm.completion_date}
              onChange={(e) =>
                setCompletionForm((p) => ({ ...p, completion_date: e.target.value }))
              }
              className="mt-1 h-10 rounded-lg border-gray-100"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Contractor name
              </label>
              <Input
                value={completionForm.contractor_name}
                onChange={(e) =>
                  setCompletionForm((p) => ({ ...p, contractor_name: e.target.value }))
                }
                placeholder="Contractor"
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Client name
              </label>
              <Input
                value={completionForm.client_name}
                onChange={(e) => setCompletionForm((p) => ({ ...p, client_name: e.target.value }))}
                placeholder="Client"
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Contractor signature
              </label>
              <Input
                value={completionForm.contractor_signature}
                onChange={(e) =>
                  setCompletionForm((p) => ({ ...p, contractor_signature: e.target.value }))
                }
                placeholder="Signature"
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Client signature
              </label>
              <Input
                value={completionForm.client_signature}
                onChange={(e) =>
                  setCompletionForm((p) => ({ ...p, client_signature: e.target.value }))
                }
                placeholder="Signature"
                className="mt-1 h-10 rounded-lg border-gray-100"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={saveCompletion}
              disabled={saving === "completion"}
            >
              <SubmitSpinner loading={saving === "completion"} className="mr-2" />
              {saving === "completion" ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              className="rounded-lg bg-black text-white hover:bg-black/90"
              onClick={generateCompletionPdf}
              disabled={!!generating}
            >
              {generating === "completion-pdf"
                ? "Generating…"
                : "Generate Completion Certificate PDF"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
