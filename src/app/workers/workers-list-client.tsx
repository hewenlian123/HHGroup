"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import type { WorkerRow, WorkerStatus } from "@/lib/workers-db";
import { updateWorkerAction, deleteWorkerAction } from "./actions";
import { AddWorkerModal } from "./add-worker-modal";
import { EmptyState } from "@/components/empty-state";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { UserPlus } from "lucide-react";

function fmtRate(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function WorkersListClient({ rows }: { rows: WorkerRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [editFor, setEditFor] = React.useState<WorkerRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [dailyRate, setDailyRate] = React.useState("");
  const [defaultOtRate, setDefaultOtRate] = React.useState("");
  const [status, setStatus] = React.useState<WorkerStatus>("Active");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!editFor) return;
    setName(editFor.name ?? "");
    setPhone(editFor.phone ?? "");
    setTrade(editFor.trade ?? "");
    setDailyRate(editFor.daily_rate != null ? String(editFor.daily_rate) : "");
    setDefaultOtRate(editFor.default_ot_rate != null ? String(editFor.default_ot_rate) : "");
    setStatus(editFor.status ?? "Active");
    setNotes(editFor.notes ?? "");
  }, [editFor]);

  const onSaveEdit = async () => {
    if (!editFor) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await updateWorkerAction(editFor.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        trade: trade.trim() || null,
        daily_rate: Number(dailyRate) || 0,
        default_ot_rate: Number(defaultOtRate) || 0,
        status,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast({ title: "Save failed", description: res.error ?? "Failed to update worker.", variant: "error" });
        return;
      }
      toast({ title: "Saved", variant: "success" });
      setEditFor(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: WorkerRow) => {
    if (busy) return;
    if (!window.confirm(`Delete worker "${row.name}"?`)) return;
    setBusy(true);
    try {
      const res = await deleteWorkerAction(row.id);
      if (!res.ok) {
        toast({ title: "Delete failed", description: res.error ?? "Failed to delete worker.", variant: "error" });
        return;
      }
      toast({ title: "Deleted", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleAddSuccess = () => router.refresh();

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          title="No workers yet"
          description="Add workers to track trades, daily rates, and OT rates."
          icon={<UserPlus className="h-5 w-5" />}
          action={
            <Button size="touch" className="min-h-[44px]" onClick={() => setAddOpen(true)}>
              Add Worker
            </Button>
          }
        />
        <AddWorkerModal open={addOpen} onOpenChange={setAddOpen} onSuccess={handleAddSuccess} />
      </>
    );
  }

  return (
    <>
      {/* Mobile: card layout */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-sm border border-border/60 bg-background p-4">
            <p className="font-medium text-foreground">{r.name}</p>
            <p className="text-sm text-muted-foreground">{r.trade ?? "—"} · {r.phone ?? "—"}</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span className="tabular-nums text-muted-foreground">Daily {fmtRate(r.daily_rate)}</span>
              <span className={r.status === "Active" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>{r.status}</span>
            </div>
            <div className="mt-3 flex justify-end">
              <RowActionsMenu
                ariaLabel={`Actions for ${r.name}`}
                actions={[
                  { label: "Edit", onClick: () => setEditFor(r), disabled: busy },
                  { label: "Delete", onClick: () => void onDelete(r), destructive: true, disabled: busy },
                ]}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="table-responsive hidden md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm md:min-w-0">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Trade</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">Daily Rate</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider tabular-nums text-muted-foreground">Default OT Rate</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="w-10 px-1 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="px-3 py-1.5 font-medium">{r.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.trade ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.phone ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtRate(r.daily_rate)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtRate(r.default_ot_rate)}</td>
                <td className="px-3 py-1.5">
                  <span className={r.status === "Active" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                    {r.status}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <RowActionsMenu
                    ariaLabel={`Actions for ${r.name}`}
                    actions={[
                      { label: "Edit", onClick: () => setEditFor(r), disabled: busy },
                      { label: "Delete", onClick: () => void onDelete(r), destructive: true, disabled: busy },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddWorkerModal open={addOpen} onOpenChange={setAddOpen} onSuccess={handleAddSuccess} />

      <Dialog open={!!editFor} onOpenChange={(open) => !open && setEditFor(null)}>
        <DialogContent className="max-w-md gap-4 p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit Worker</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name (required)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Trade</label>
                <Input value={trade} onChange={(e) => setTrade(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Daily Rate</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default OT Rate</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={defaultOtRate}
                  onChange={(e) => setDefaultOtRate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkerStatus)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" className="h-8" onClick={() => void onSaveEdit()} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
