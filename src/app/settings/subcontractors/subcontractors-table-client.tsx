"use client";

import { dispatchClientDataSync } from "@/lib/sync-router-client";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoModal,
  NeoMobileCard,
  NeoPanel,
  NeoStatus,
  NeoTable,
  neoFormNoticeClassName,
} from "@/components/base";
import { tableRawThClass } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import type { SubcontractorRow } from "@/lib/data";
import {
  deleteSubcontractorAction,
  updateSubcontractorProfile,
} from "@/app/subcontractors/[id]/actions";
import { runOptimisticPersist } from "@/lib/optimistic-save";

export function SubcontractorsTableClient({
  rows,
  dataLoadWarning = null,
}: {
  rows: SubcontractorRow[];
  dataLoadWarning?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [localRows, setLocalRows] = React.useState<SubcontractorRow[]>(rows);
  const rowsRef = React.useRef(localRows);
  React.useEffect(() => {
    setLocalRows(rows);
  }, [rows]);
  React.useEffect(() => {
    rowsRef.current = localRows;
  }, [localRows]);
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

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const onSave = () => {
    if (!editFor) return;
    const row = editFor;
    const patch = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      insurance_expiration_date: insuranceExpiration.trim() || null,
      notes: notes.trim() || null,
    };
    const optimistic: SubcontractorRow = { ...row, ...patch };

    type Snap = { rows: SubcontractorRow[]; editing: SubcontractorRow };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ rows: [...rowsRef.current], editing: row }),
      apply: () => {
        setLocalRows((prev) => prev.map((r) => (r.id === row.id ? optimistic : r)));
        setEditFor(null);
      },
      rollback: (s) => {
        setLocalRows(s.rows);
        setEditFor(s.editing);
      },
      persist: () =>
        updateSubcontractorProfile(row.id, patch).then((res) => {
          if (!res.ok) return { error: res.error ?? "Failed to update subcontractor." };
          dispatchClientDataSync({ reason: "subcontractor-profile" });
          return undefined;
        }),
      onError: (msg) => toast({ title: "Save failed", description: msg, variant: "error" }),
      onSuccess: () => toast({ title: "Saved", variant: "success" }),
    });
  };

  const onDelete = async (row: SubcontractorRow) => {
    if (busy) return;
    if (!window.confirm(`Delete subcontractor "${row.name}"?`)) return;
    let snapshot: SubcontractorRow[] | undefined;
    setLocalRows((prev) => {
      snapshot = prev;
      return prev.filter((r) => r.id !== row.id);
    });
    setBusy(true);
    try {
      const res = await deleteSubcontractorAction(row.id);
      if (!res.ok) {
        if (snapshot) setLocalRows(snapshot);
        toast({
          title: "Delete failed",
          description: res.error ?? "Failed to delete subcontractor.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Deleted", variant: "success" });
      dispatchClientDataSync({ reason: "subcontractor-deleted" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {dataLoadWarning ? (
        <p className={neoFormNoticeClassName} role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      <NeoPanel bodyClassName="p-0">
        {localRows.length === 0 ? (
          <EmptyState
            title={dataLoadWarning ? "Could not load subcontractors" : "No subcontractors yet"}
            description={
              dataLoadWarning
                ? "Refresh or try again after the data connection recovers."
                : "Add a subcontractor to make them available across project workflows."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <NeoTable tableClassName="min-w-[760px]">
                <thead>
                  <tr>
                    <th className={tableRawThClass}>Name</th>
                    <th className={tableRawThClass}>Phone</th>
                    <th className={tableRawThClass}>Email</th>
                    <th className={tableRawThClass}>Status</th>
                    <th className="w-40 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {localRows.map((r) => (
                    <tr key={r.id} className="table-row-compact">
                      <td className="px-3 py-2 font-medium text-[var(--hh-text-primary)]">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-[var(--hh-text-secondary)]">
                        {r.phone ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--hh-text-secondary)]">
                        {r.email ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <NeoStatus
                          label={r.active ? "Active" : "Inactive"}
                          variant={r.active ? "success" : "muted"}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-7 text-xs"
                            onClick={() => setEditFor(r)}
                            disabled={busy}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-7 text-hh-helper text-[var(--hh-danger)]"
                            onClick={() => void onDelete(r)}
                            disabled={busy}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </NeoTable>
            </div>
            <div className="grid gap-3 p-3 md:hidden">
              {localRows.map((r) => (
                <NeoMobileCard key={r.id} className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-hh-body-strong text-[var(--hh-text-primary)]">
                        {r.name}
                      </p>
                      <p className="text-hh-metadata text-[var(--hh-text-secondary)]">
                        {r.email ?? r.phone ?? "No contact details"}
                      </p>
                    </div>
                    <NeoStatus
                      label={r.active ? "Active" : "Inactive"}
                      variant={r.active ? "success" : "muted"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-hh-metadata text-[var(--hh-text-secondary)]">
                    <span>{r.phone ?? "No phone"}</span>
                    <span className="text-right">{r.email ?? "No email"}</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-sm text-xs"
                      onClick={() => setEditFor(r)}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-hh-compact text-hh-helper text-[var(--hh-danger)]"
                      onClick={() => void onDelete(r)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          </>
        )}
      </NeoPanel>

      <Dialog open={!!editFor} onOpenChange={(open) => !open && setEditFor(null)}>
        <NeoModal
          title="Edit subcontractor"
          className="max-w-md"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-sm"
                onClick={() => setEditFor(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-sm"
                onClick={() => void onSave()}
                disabled={busy || !name.trim()}
              >
                <SubmitSpinner loading={busy} className="mr-2" />
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <div className="space-y-1.5">
            <NeoFieldLabel required>Name</NeoFieldLabel>
            <NeoInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
              required
            />
          </div>
          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel>Phone</NeoFieldLabel>
              <NeoInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Email</NeoFieldLabel>
              <NeoInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </NeoFormGrid>
          <div className="space-y-1.5">
            <NeoFieldLabel>Address</NeoFieldLabel>
            <NeoInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <NeoFieldLabel>Insurance expiration</NeoFieldLabel>
            <NeoInput
              type="date"
              value={insuranceExpiration}
              onChange={(e) => setInsuranceExpiration(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <NeoFieldLabel>Notes</NeoFieldLabel>
            <NeoInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </NeoModal>
      </Dialog>
    </>
  );
}
