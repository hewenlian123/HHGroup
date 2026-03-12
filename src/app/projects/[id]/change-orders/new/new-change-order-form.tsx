"use client";

import { useTransition } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SectionHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createChangeOrderAction } from "../actions";

export function NewChangeOrderForm({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="mb-3">
        <Link
          href={`/projects/${projectId}?tab=change-orders`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {projectName}
        </Link>
      </div>
      <PageHeader
        title="New Change Order"
        description="Draft → Pending Approval → Approved | Rejected. Only Approved COs affect project revenue."
      />
      <Divider />
      <form
        action={(formData) => {
          startTransition(async () => {
            await createChangeOrderAction(projectId, formData);
          });
        }}
        className="max-w-xl space-y-4"
      >
        <SectionHeader label="Details" />
        <div className="grid gap-3 sm:grid-cols-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <Input name="title" placeholder="e.g. Additional scope – Phase 2" className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              name="description"
              placeholder="Describe the change and reason."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount (revenue impact)</label>
              <Input name="amount" type="number" step="0.01" min="0" placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Cost impact</label>
              <Input name="costImpact" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Schedule impact (days)</label>
              <Input name="scheduleImpactDays" type="number" step="1" min="0" placeholder="0" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border/60 pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create change order"}
          </Button>
          <Link href={`/projects/${projectId}?tab=change-orders`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
