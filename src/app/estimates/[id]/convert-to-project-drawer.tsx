"use client";

import * as React from "react";
import { Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/toast/toast-provider";
import type { EstimateMetaRecord } from "@/lib/estimates-db";
import { convertToProjectWithSetupAction } from "./actions";
import { cn } from "@/lib/utils";
import { EB, ebInput } from "../_components/estimate-builder-ui";

export function ConvertToProjectDrawer({
  open,
  onOpenChange,
  estimateId,
  estimateNumber,
  meta,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  estimateNumber: string;
  meta: EstimateMetaRecord;
  onSuccess: (projectId: string) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("estimateId", estimateId);
    startTransition(async () => {
      const res = await convertToProjectWithSetupAction(fd);
      if (res.ok && res.projectId) {
        onOpenChange(false);
        onSuccess(res.projectId);
      } else {
        const msg = res.error ?? "Could not create project";
        setError(msg);
        toast({ title: "Create project failed", description: msg, variant: "error" });
      }
    });
  };

  const projectName = meta.project?.name ?? "";
  const clientName = meta.client?.name ?? "";
  const address = meta.client?.address || meta.project?.siteAddress || "";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Set up project"
      description="Edit project details, then create the project from this estimate."
      className="border-l border-white/10 bg-slate-950/95 text-zinc-100 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    >
      <form id="convert-to-project-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="estimateId" value={estimateId} />

        <div className="space-y-2">
          <Label htmlFor="convert-projectName">Project name</Label>
          <Input
            id="convert-projectName"
            name="projectName"
            defaultValue={projectName}
            placeholder="Project name"
            className={ebInput("h-11")}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="convert-client">Client</Label>
          <Input
            id="convert-client"
            name="client"
            defaultValue={clientName}
            placeholder="Client"
            className={ebInput("h-11")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="convert-address">Address</Label>
          <Input
            id="convert-address"
            name="address"
            defaultValue={address}
            placeholder="Address"
            className={ebInput("h-11")}
          />
        </div>

        <div className="space-y-2">
          <Label>Estimate reference</Label>
          <Input
            value={estimateNumber}
            readOnly
            className={ebInput("h-11 cursor-not-allowed bg-white/[0.025] text-zinc-400")}
            aria-readonly
          />
          <input type="hidden" name="estimateRef" value={estimateNumber} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="convert-projectManager">Project manager</Label>
          <Input
            id="convert-projectManager"
            name="projectManager"
            placeholder="Project manager"
            className={ebInput("h-11")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="convert-startDate">Start date</Label>
            <Input
              id="convert-startDate"
              name="startDate"
              type="date"
              className={ebInput("h-11")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="convert-endDate">End date</Label>
            <Input id="convert-endDate" name="endDate" type="date" className={ebInput("h-11")} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="convert-notes">Notes</Label>
          <Input id="convert-notes" name="notes" placeholder="Notes" className={ebInput("h-11")} />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "min-h-11 flex-1 border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.08] hover:text-zinc-50",
              EB.btnGhost
            )}
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={cn(
              "min-h-11 flex-1 border border-white/10 bg-slate-950 text-zinc-50 hover:bg-slate-900",
              EB.btnPrimary
            )}
            disabled={pending}
          >
            {pending ? "Creating…" : "Create project"}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
