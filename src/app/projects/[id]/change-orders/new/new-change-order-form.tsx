"use client";

import * as React from "react";
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
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <div className="mb-3">
        <Link
          href={`/projects/${projectId}?tab=change-orders`}
          className="inline-flex min-h-[44px] items-center text-hh-metadata text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
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
          setError(null);
          startTransition(async () => {
            const res = await createChangeOrderAction(projectId, formData);
            if (res && res.ok === false) {
              setError(res.error ?? "Failed to create change order.");
            }
          });
        }}
        className="max-w-xl space-y-4"
      >
        <SectionHeader label="Details" />
        <div className="grid gap-3 sm:grid-cols-1">
          <div>
            <label
              htmlFor="new-change-order-title"
              className="mb-1 block text-hh-metadata font-medium text-[var(--hh-text-secondary)]"
            >
              Title
            </label>
            <Input
              id="new-change-order-title"
              name="title"
              placeholder="e.g. Additional scope – Phase 2"
              className="min-h-[44px] w-full"
            />
          </div>
          <div>
            <label
              htmlFor="new-change-order-description"
              className="mb-1 block text-hh-metadata font-medium text-[var(--hh-text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="new-change-order-description"
              name="description"
              placeholder="Describe the change and reason."
              rows={3}
              className="min-h-[88px] w-full rounded-hh-standard border border-input bg-[var(--hh-l1-workspace)] px-3 py-2 text-hh-body"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="new-change-order-amount"
                className="mb-1 block text-hh-metadata font-medium text-[var(--hh-text-secondary)]"
              >
                Amount (revenue impact)
              </label>
              <Input
                id="new-change-order-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                className="min-h-[44px]"
              />
            </div>
            <div>
              <label
                htmlFor="new-change-order-cost-impact"
                className="mb-1 block text-hh-metadata font-medium text-[var(--hh-text-secondary)]"
              >
                Cost impact
              </label>
              <Input
                id="new-change-order-cost-impact"
                name="costImpact"
                type="number"
                step="0.01"
                placeholder="0"
                className="min-h-[44px]"
              />
            </div>
            <div>
              <label
                htmlFor="new-change-order-schedule-impact"
                className="mb-1 block text-hh-metadata font-medium text-[var(--hh-text-secondary)]"
              >
                Schedule impact (days)
              </label>
              <Input
                id="new-change-order-schedule-impact"
                name="scheduleImpactDays"
                type="number"
                step="1"
                min="0"
                placeholder="0"
                className="min-h-[44px]"
              />
            </div>
          </div>
        </div>
        {error ? <p className="text-hh-body text-destructive">{error}</p> : null}
        <div className="flex gap-2 border-t border-border/60 pt-4">
          <Button type="submit" className="min-h-[44px]" disabled={pending}>
            {pending ? "Creating…" : "Create change order"}
          </Button>
          <Link href={`/projects/${projectId}?tab=change-orders`}>
            <Button type="button" variant="outline" className="min-h-[44px]">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
