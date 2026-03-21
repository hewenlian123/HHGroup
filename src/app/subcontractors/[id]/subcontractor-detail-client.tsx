"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { SubcontractorRow } from "@/lib/data";
import { deleteSubcontractorAction, updateSubcontractorProfile } from "./actions";

export function SubcontractorDetailClient({ subcontractor }: { subcontractor: SubcontractorRow }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(subcontractor.name);
  const [phone, setPhone] = React.useState(subcontractor.phone ?? "");
  const [email, setEmail] = React.useState(subcontractor.email ?? "");
  const [address, setAddress] = React.useState(subcontractor.address ?? "");
  const [insuranceExpiration, setInsuranceExpiration] = React.useState(subcontractor.insurance_expiration_date ?? "");
  const [notes, setNotes] = React.useState(subcontractor.notes ?? "");

  React.useEffect(() => {
    setName(subcontractor.name);
    setPhone(subcontractor.phone ?? "");
    setEmail(subcontractor.email ?? "");
    setAddress(subcontractor.address ?? "");
    setInsuranceExpiration(subcontractor.insurance_expiration_date ?? "");
    setNotes(subcontractor.notes ?? "");
  }, [subcontractor]);

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await updateSubcontractorProfile(subcontractor.id, {
      name,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      insurance_expiration_date: insuranceExpiration.trim() || null,
      notes: notes.trim() || null,
    });
    if (res.ok) {
      setEditOpen(false);
      void syncRouterAndClients(router);
    } else {
      setError(res.error ?? "Failed to update.");
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm("Delete this subcontractor?")) return;
    setBusy(true);
    setError(null);
    const res = await deleteSubcontractorAction(subcontractor.id);
    if (res.ok) {
      router.push("/subcontractors");
      void syncRouterAndClients(router);
      return;
    }
    setError(res.error ?? "Failed to delete.");
    setBusy(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-red-600" onClick={handleDelete} disabled={busy}>
          Delete
        </Button>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit subcontractor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name (required)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Insurance expiration</label>
              <Input type="date" value={insuranceExpiration} onChange={(e) => setInsuranceExpiration(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-9" />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

