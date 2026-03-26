"use client";

import * as React from "react";
import { SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectCommission } from "@/lib/data";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"] as const;
const CALC_MODES = ["Auto", "Manual"] as const;
const STATUSES = ["Pending", "Approved", "Paid", "Cancelled"] as const;

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProjectCommissionTab({
  projectId,
  commissions,
  onRefresh,
}: {
  projectId: string;
  commissions: ProjectCommission[];
  onRefresh: () => void;
}) {
  const [rows, setRows] = React.useState<ProjectCommission[]>(commissions);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    person_name: "",
    role: "Other" as string,
    calculation_mode: "Auto" as string,
    rate: "",
    base_amount: "",
    commission_amount: "",
    status: "Pending" as string,
    notes: "",
  });

  const computedCommission =
    form.calculation_mode === "Auto" && form.rate !== "" && form.base_amount !== ""
      ? Number(form.base_amount) * Number(form.rate)
      : null;

  React.useEffect(() => {
    setRows(commissions);
  }, [commissions]);

  const handleOpen = () => {
    setForm({
      person_name: "",
      role: "Other",
      calculation_mode: "Auto",
      rate: "",
      base_amount: "",
      commission_amount: "",
      status: "Pending",
      notes: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const rate = Math.max(0, Number(form.rate) || 0);
      const base_amount = Math.max(0, Number(form.base_amount) || 0);
      const commission_amount =
        form.calculation_mode === "Auto"
          ? Math.round(base_amount * rate * 100) / 100
          : Math.max(0, Number(form.commission_amount) || 0);
      const res = await fetch(`/api/projects/${projectId}/commissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_name: form.person_name.trim(),
          role: form.role,
          calculation_mode: form.calculation_mode,
          rate,
          base_amount,
          commission_amount,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create commission");
      if (data?.commission) {
        setRows((prev) => [data.commission as ProjectCommission, ...prev]);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this commission?")) return;
    const prev = rows;
    setDeletingId(id);
    setRows((p) => p.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/projects/${projectId}/commissions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to delete");
      setRows((prev) => prev.filter((r) => r.id !== id));
      onRefresh();
    } catch (err) {
      setRows(prev);
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <SectionHeader
        label="Commissions"
        action={
          <Button size="sm" className="rounded-sm" onClick={handleOpen}>
            + Add Commission
          </Button>
        }
      />
      <Divider />
      <div className="overflow-x-auto rounded-sm border border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Person
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Role
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Calculation Mode
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                Rate
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                Base Amount
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                Commission Amount
              </th>
              <th className="text-left py-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted-foreground text-sm">
                  No commissions. Click &quot;+ Add Commission&quot; to add one.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-2 px-3 font-medium text-foreground">{c.person_name || "—"}</td>
                  <td className="py-2 px-3 text-muted-foreground">{c.role}</td>
                  <td className="py-2 px-3 text-muted-foreground">{c.calculation_mode}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {c.rate > 0 ? (c.rate * 100).toFixed(1) + "%" : "—"}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">${fmtUsd(c.base_amount)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">
                    ${fmtUsd(c.commission_amount)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{c.status}</td>
                  <td className="py-2 px-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                    >
                      {deletingId === c.id ? "Deleting…" : "Delete"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md border-border/60 rounded-sm gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Commission</DialogTitle>
          </DialogHeader>
          <form id="commission-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Person</label>
              <Input
                value={form.person_name}
                onChange={(e) => setForm((p) => ({ ...p, person_name: e.target.value }))}
                placeholder="Name"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Calculation Mode
              </label>
              <select
                value={form.calculation_mode}
                onChange={(e) => setForm((p) => ({ ...p, calculation_mode: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {CALC_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Rate (decimal, e.g. 0.05 = 5%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.rate}
                  onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Base Amount
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.base_amount}
                  onChange={(e) => setForm((p) => ({ ...p, base_amount: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Commission Amount{" "}
                {form.calculation_mode === "Auto" && computedCommission != null
                  ? `(auto: $${fmtUsd(computedCommission)})`
                  : ""}
              </label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={
                  form.calculation_mode === "Auto" && computedCommission != null
                    ? String(computedCommission)
                    : form.commission_amount
                }
                onChange={(e) => setForm((p) => ({ ...p, commission_amount: e.target.value }))}
                disabled={form.calculation_mode === "Auto"}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
          <DialogFooter className="border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm h-9"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="commission-form"
              size="sm"
              disabled={submitting}
              className="rounded-sm h-9"
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
