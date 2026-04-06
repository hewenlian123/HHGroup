"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommissionPaymentStatus, CommissionWithPaid } from "@/lib/data";
import { cn } from "@/lib/utils";

const ROLES = ["Designer", "Sales", "Referral", "Agent", "Other"] as const;
const CALC_MODES = ["Auto", "Manual"] as const;

const COMMISSION_MODAL =
  "max-w-[480px] w-full gap-0 border-0 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-xl sm:rounded-xl sm:max-w-[480px]";
const COMMISSION_LABEL = "mb-1.5 block text-[12px] font-medium text-text-secondary";
const COMMISSION_FIELD =
  "h-10 rounded-lg border border-gray-100 bg-white text-[14px] focus-visible:border-black focus-visible:ring-1 focus-visible:ring-black";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ProjectPaymentStatus({ status }: { status: CommissionPaymentStatus }) {
  const cfg =
    status === "paid"
      ? { dot: "bg-[#22C55E]", label: "Paid", text: "text-[#166534]" }
      : status === "partial"
        ? { dot: "bg-[#EAB308]", label: "Partial", text: "text-[#854D0E]" }
        : { dot: "bg-[#9CA3AF]", label: "Unpaid", text: "text-text-secondary" };
  return (
    <span className="inline-flex items-center gap-2 text-[14px]">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", cfg.dot)} aria-hidden />
      <span className={cn("font-medium", cfg.text)}>{cfg.label}</span>
    </span>
  );
}

export function ProjectCommissionTab({
  projectId,
  commissions,
  onRefresh,
}: {
  projectId: string;
  commissions: CommissionWithPaid[];
  onRefresh: () => void;
}) {
  const [rows, setRows] = React.useState<CommissionWithPaid[]>(commissions);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<CommissionWithPaid | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    person_name: "",
    role: "Other" as string,
    calculation_mode: "Auto" as string,
    rate: "",
    base_amount: "",
    commission_amount: "",
    notes: "",
  });

  const computedCommission =
    form.calculation_mode === "Auto" && form.rate !== "" && form.base_amount !== ""
      ? Number(form.base_amount) * Number(form.rate)
      : null;

  React.useEffect(() => {
    setRows(commissions);
  }, [commissions]);

  const loadCommissionsFromApi = React.useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/commissions`, { cache: "no-store" });
    const data = (await res.json()) as {
      ok?: boolean;
      commissions?: CommissionWithPaid[];
      message?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.commissions)) {
      throw new Error(data.message ?? "Failed to load commissions");
    }
    setRows(data.commissions);
  }, [projectId]);

  const handleOpen = () => {
    setForm({
      person_name: "",
      role: "Other",
      calculation_mode: "Auto",
      rate: "",
      base_amount: "",
      commission_amount: "",
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
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create commission");
      try {
        await loadCommissionsFromApi();
        setModalOpen(false);
      } catch (loadErr) {
        setError(
          loadErr instanceof Error
            ? `${loadErr.message} (record may be saved — check the table or refresh the page)`
            : "Could not refresh the list after save."
        );
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = React.useCallback(async () => {
    const row = pendingDelete;
    if (!row?.id) return;
    const id = row.id;
    const prev = rows;
    setPendingDelete(null);
    setDeletingId(id);
    setRows((p) => p.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/projects/${projectId}/commissions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      let data: { ok?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; message?: string };
      } catch {
        /* empty or non-JSON body */
      }
      if (!res.ok) {
        throw new Error(data.message ?? `Delete failed (${res.status})`);
      }
      try {
        await loadCommissionsFromApi();
      } catch {
        /* Row already removed from UI */
      }
      onRefresh();
    } catch (err) {
      setRows(prev);
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }, [pendingDelete, projectId, rows, loadCommissionsFromApi, onRefresh]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
          Commissions
        </h3>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg bg-[#111827] px-4 text-[14px] font-medium text-white hover:bg-black/90"
          onClick={handleOpen}
          data-testid="project-commission-add"
        >
          + Add Commission
        </Button>
      </div>

      <div className="airtable-table-wrap airtable-table-wrap--ruled bg-white/60">
        <div className="airtable-table-scroll">
          <table className="w-full text-[14px]">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Person
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Role
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Mode
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Rate
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Base
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Commission
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Paid
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Outstd.
                </th>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Status
                </th>
                <th className="h-8 w-12 px-2 align-middle" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[14px] text-text-secondary">
                    No commissions. Click &quot;+ Add Commission&quot; to add one.
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[#E8E4DD] last:border-b-0 transition-colors hover:bg-white/90"
                    data-testid={`project-commission-row-${c.id}`}
                  >
                    <td className="px-3 py-3.5 font-medium text-text-primary">
                      {c.person_name || "—"}
                    </td>
                    <td className="px-3 py-3.5 text-[#374151]">{c.role}</td>
                    <td className="px-3 py-3.5 text-text-secondary">{c.calculation_mode}</td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-text-secondary">
                      {c.rate > 0 ? `${(c.rate * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-[#374151]">
                      ${fmtUsd(c.base_amount)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums font-medium text-text-primary">
                      ${fmtUsd(c.commission_amount)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums text-text-secondary">
                      ${fmtUsd(c.paid_amount)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums font-medium text-text-primary">
                      ${fmtUsd(c.outstanding_amount)}
                    </td>
                    <td className="px-3 py-3.5">
                      <ProjectPaymentStatus status={c.payment_status} />
                    </td>
                    <td className="px-2 py-3.5">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-red-600"
                        data-testid={`project-commission-delete-${c.id}`}
                        aria-label={deletingId === c.id ? "Deleting" : "Delete commission"}
                        disabled={deletingId === c.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingDelete(c);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className={COMMISSION_MODAL}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold text-text-primary">
              Delete commission
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Remove this commission for{" "}
            <span className="font-medium text-text-primary">
              {pendingDelete?.person_name?.trim() || "this person"}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
              data-testid="project-commission-delete-cancel"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId != null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-10 rounded-lg bg-red-600 text-[14px] font-medium text-white hover:bg-red-700"
              data-testid="project-commission-delete-confirm"
              disabled={deletingId != null}
              onClick={() => void confirmDelete()}
            >
              {deletingId != null ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={COMMISSION_MODAL}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold text-text-primary">
              Add Commission
            </DialogTitle>
          </DialogHeader>
          <form id="commission-form" onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div>
              <label className={COMMISSION_LABEL}>Person</label>
              <Input
                value={form.person_name}
                onChange={(e) => setForm((p) => ({ ...p, person_name: e.target.value }))}
                placeholder="Name"
                className={COMMISSION_FIELD}
                data-testid="project-commission-person"
              />
            </div>
            <div>
              <label className={COMMISSION_LABEL}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className={cn("w-full rounded-lg px-3", COMMISSION_FIELD)}
                data-testid="project-commission-role"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={COMMISSION_LABEL}>Calculation Mode</label>
              <select
                value={form.calculation_mode}
                onChange={(e) => setForm((p) => ({ ...p, calculation_mode: e.target.value }))}
                className={cn("w-full rounded-lg px-3", COMMISSION_FIELD)}
                data-testid="project-commission-calculation-mode"
              >
                {CALC_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={COMMISSION_LABEL}>Rate (e.g. 0.05 = 5%)</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.rate}
                  onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                  className={COMMISSION_FIELD}
                  data-testid="project-commission-rate"
                />
              </div>
              <div>
                <label className={COMMISSION_LABEL}>Base Amount</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.base_amount}
                  onChange={(e) => setForm((p) => ({ ...p, base_amount: e.target.value }))}
                  className={COMMISSION_FIELD}
                  data-testid="project-commission-base-amount"
                />
              </div>
            </div>
            <div>
              <label className={COMMISSION_LABEL}>
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
                className={COMMISSION_FIELD}
                data-testid="project-commission-amount"
              />
            </div>
            <div>
              <label className={COMMISSION_LABEL}>Notes</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                className={COMMISSION_FIELD}
                data-testid="project-commission-notes"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
          <DialogFooter className="mt-6 border-t border-[#F0EDE8] bg-transparent pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary hover:bg-[#F9FAFB]"
              data-testid="project-commission-cancel"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="commission-form"
              className="h-10 rounded-lg bg-[#111827] text-[14px] font-medium text-white hover:bg-black/90"
              disabled={submitting}
              data-testid="project-commission-save"
            >
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
