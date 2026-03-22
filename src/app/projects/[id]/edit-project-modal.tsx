"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/data";
import { Loader2 } from "lucide-react";

type CustomerOption = { id: string; name: string };

/** Payload passed to parent for optimistic UI + background server action. */
export type ProjectEditSavePatch = {
  name: string;
  address: string;
  budget: number;
  customerId: string | null;
  /** Resolved label for overview customer line; null when cleared. */
  customerName: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<Project, "id" | "name" | "address" | "budget" | "customerId">;
  /** Synchronous: parent applies optimistic UI and closes modal; runs server work in background. */
  onSave: (patch: ProjectEditSavePatch) => void;
};

export function EditProjectModal({ open, onOpenChange, project, onSave }: Props) {
  const [name, setName] = React.useState(project.name ?? "");
  const [address, setAddress] = React.useState(project.address ?? "");
  const [budget, setBudget] = React.useState(String(project.budget ?? ""));
  const [customerId, setCustomerId] = React.useState<string | null>(project.customerId ?? null);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(project.name ?? "");
      setAddress(project.address ?? "");
      setBudget(String(project.budget ?? ""));
      setCustomerId(project.customerId ?? null);
      setError(null);
    }
  }, [open, project.name, project.address, project.budget, project.customerId]);

  React.useEffect(() => {
    if (!open) return;
    setCustomersLoading(true);
    fetch("/api/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCustomers((data.customers ?? []) as CustomerOption[]))
      .catch(() => setCustomers([]))
      .finally(() => setCustomersLoading(false));
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const nameTrim = name.trim();
    if (!nameTrim) {
      setError("Project name is required.");
      return;
    }
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      setError("Budget must be 0 or greater.");
      return;
    }

    const cid = customerId?.trim() || null;
    const customerName = cid ? (customers.find((c) => c.id === cid)?.name ?? null) : null;

    flushSync(() => {
      setSaving(true);
      setError(null);
    });

    try {
      onSave({
        name: nameTrim,
        address: address.trim(),
        budget: budgetNum,
        customerId: cid,
        customerName,
      });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60 rounded-md p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Edit project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="edit-project-name">Project name</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 text-sm"
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-project-customer">Customer</Label>
            <select
              id="edit-project-customer"
              value={customerId ?? ""}
              onChange={(e) => setCustomerId(e.target.value || null)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={saving || customersLoading}
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-project-address">Address</Label>
            <Input
              id="edit-project-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-9 text-sm"
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-project-budget">Budget</Label>
            <Input
              id="edit-project-budget"
              type="number"
              min="0"
              step="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-9 text-sm tabular-nums"
              disabled={saving}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving} aria-busy={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
