"use client";

import * as React from "react";
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
import { updateProjectAction } from "../actions";
import type { Project } from "@/lib/data";

type CustomerOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<Project, "id" | "name" | "address" | "budget" | "customerId">;
  onSaved?: () => void;
};

export function EditProjectModal({
  open,
  onOpenChange,
  project,
  onSaved,
}: Props) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSaving(true);
    setError(null);
    try {
      const result = await updateProjectAction(project.id, {
        name: nameTrim,
        address: address.trim(),
        budget: budgetNum,
        customerId: customerId?.trim() || null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60 rounded-md p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Edit project
          </DialogTitle>
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
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
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
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
