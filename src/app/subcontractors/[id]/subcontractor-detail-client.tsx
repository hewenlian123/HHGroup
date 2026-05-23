"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Dialog } from "@/components/ui/dialog";
import { NeoFieldLabel, NeoInput, NeoModal, neoFormErrorClassName } from "@/components/base";
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
  const [insuranceExpiration, setInsuranceExpiration] = React.useState(
    subcontractor.insurance_expiration_date ?? ""
  );
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
      syncRouterNonBlocking(router);
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
      syncRouterNonBlocking(router);
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
      syncRouterNonBlocking(router);
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
        <Button
          variant="outline"
          size="sm"
          className="btn-outline-ghost h-8 text-red-600"
          onClick={handleDelete}
          disabled={busy}
        >
          Delete
        </Button>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <NeoModal title="Edit subcontractor" className="max-w-md">
          <div className="grid gap-3 py-2">
            <div>
              <NeoFieldLabel required>Name</NeoFieldLabel>
              <NeoInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9"
                required
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <NeoFieldLabel>Phone</NeoFieldLabel>
                <NeoInput
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <NeoFieldLabel>Email</NeoFieldLabel>
                <NeoInput
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <div>
              <NeoFieldLabel>Address</NeoFieldLabel>
              <NeoInput
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <NeoFieldLabel>Insurance expiration</NeoFieldLabel>
              <NeoInput
                type="date"
                value={insuranceExpiration}
                onChange={(e) => setInsuranceExpiration(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            {error ? <p className={neoFormErrorClassName}>{error}</p> : null}
          </div>
          <div className="-mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-[var(--neo-border)] px-5 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={busy}>
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </NeoModal>
      </Dialog>
    </>
  );
}
