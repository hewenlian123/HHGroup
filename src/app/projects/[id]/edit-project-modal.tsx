"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  NeoActionFooter,
  NeoFieldLabel,
  NeoInput,
  NeoModal,
  neoFormErrorClassName,
  neoFormFieldClassName,
} from "@/components/base";
import {
  budgetDigits,
  ProjectAddressField,
  ProjectBudgetInput,
} from "@/components/projects/project-form-controls";
import type { Project } from "@/lib/data";

/** Payload passed to parent for optimistic UI + background server action. */
export type ProjectEditSavePatch = {
  name: string;
  client: string;
  address: string;
  budget: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Pick<Project, "id" | "name" | "client" | "address" | "budget" | "customerId">;
  /** Synchronous: parent applies optimistic UI and closes modal; runs server work in background. */
  onSave: (patch: ProjectEditSavePatch) => void;
};

export function EditProjectModal({ open, onOpenChange, project, onSave }: Props) {
  const [name, setName] = React.useState(project.name ?? "");
  const [client, setClient] = React.useState(project.client ?? "");
  const [address, setAddress] = React.useState(project.address ?? "");
  const [budget, setBudget] = React.useState(budgetDigits(String(project.budget ?? "")));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(project.name ?? "");
      setClient(project.client ?? "");
      setAddress(project.address ?? "");
      setBudget(budgetDigits(String(project.budget ?? "")));
      setError(null);
    }
  }, [open, project.name, project.client, project.address, project.budget]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const nameTrim = name.trim();
    if (!nameTrim) {
      setError("Project name is required.");
      return;
    }
    const clientTrim = client.trim();
    if (!clientTrim) {
      setError("Client name is required.");
      return;
    }
    const addressTrim = address.trim();
    if (!addressTrim) {
      setError("Project address is required.");
      return;
    }
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum < 0) {
      setError("Budget must be 0 or greater.");
      return;
    }

    flushSync(() => {
      setSaving(true);
      setError(null);
    });

    try {
      onSave({
        name: nameTrim,
        client: clientTrim,
        address: addressTrim,
        budget: budgetNum,
      });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <NeoModal title="Edit project" bodyClassName="p-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel htmlFor="edit-project-name">Project name</NeoFieldLabel>
            <NeoInput
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel htmlFor="edit-project-client">Client</NeoFieldLabel>
            <NeoInput
              id="edit-project-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={saving}
            />
          </div>
          <ProjectAddressField
            inputId="edit-project-address"
            value={address}
            onChange={setAddress}
            disabled={saving}
          />
          <ProjectBudgetInput
            inputId="edit-project-budget"
            value={budget}
            onValueChange={setBudget}
            disabled={saving}
          />
          {error ? <p className={neoFormErrorClassName}>{error}</p> : null}
          <NeoActionFooter>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-md"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-10 rounded-md" disabled={saving} aria-busy={saving}>
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </NeoActionFooter>
        </form>
      </NeoModal>
    </Dialog>
  );
}
