"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import type { SubcontractorRow } from "@/lib/data";
import { deleteSubcontractorAction, updateSubcontractorProfile } from "@/app/subcontractors/[id]/actions";

export function SubcontractorsTableClient({ rows }: { rows: SubcontractorRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editFor, setEditFor] = React.useState<SubcontractorRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [insuranceExpiration, setInsuranceExpiration] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!editFor) return;
    setName(editFor.name ?? "");
    setPhone(editFor.phone ?? "");
    setEmail(editFor.email ?? "");
    setAddress(editFor.address ?? "");
    setInsuranceExpiration(editFor.insurance_expiration_date ?? "");
    setNotes(editFor.notes ?? "");
  }, [editFor]);

  const onSave = async () => {
    if (!editFor) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await updateSubcontractorProfile(editFor.id, {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        insurance_expiration_date: insuranceExpiration.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast({ title: "Save failed", description: res.error ?? "Failed to update subcontractor.", variant: "error" });
        return;
      }
      toast({ title: "Saved", variant: "success" });
      setEditFor(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (row: SubcontractorRow) => {
    if (busy) return;
    if (!window.confirm(`Delete subcontractor "${row.name}"?`)) return;
    setBusy(true);
    try {
      const res = await deleteSubcontractorAction(row.id);
      if (!res.ok) {
        toast({ title: "Delete failed", description: res.error ?? "Failed to delete subcontractor.", variant: "error" });
        return;
      }
      toast({ title: "Deleted", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="w-40 px-1" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={5} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No subcontractors yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3 font-medium">{r.name}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{r.phone ?? "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="py-1.5 px-3">
                    <span className={r.active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-1.5 px-1">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditFor(r)} disabled={busy}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        onClick={() => void onDelete(r)}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editFor} onOpenChange={(open) => !open && setEditFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit subcontractor</DialogTitle>
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
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Insurance expiration</label>
              <Input type="date" value={insuranceExpiration} onChange={(e) => setInsuranceExpiration(e.target.value)} className="h-9 text-sm" />
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
            <Button size="sm" className="h-8" onClick={() => void onSave()} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

