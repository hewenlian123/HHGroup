"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createProjectAction } from "../actions";

export default function NewProjectPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"active" | "pending" | "completed">("pending");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);
      setSubmitting(true);
      const formData = new FormData(e.currentTarget);
      const result = await createProjectAction(null, formData);
      if (result?.error) setError(result.error);
      setSubmitting(false);
    },
    [submitting]
  );

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="New Project" subtitle="Create a project with basic baseline fields." />
      <Card className="max-w-[640px] p-5">
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Project Name</p>
            <Input name="name" placeholder="Luxury Villa E" required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Budget (USD)</p>
            <Input name="budget" type="number" min="1" step="1" required disabled={submitting} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <select
              name="status"
              className="h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
              value={status}
              onChange={(e) =>
                setStatus((e.target.value as "active" | "pending" | "completed") ?? "pending")
              }
              disabled={submitting}
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          {error ? <p className="text-sm text-red-600/80">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2 border-t border-zinc-200/60 pt-3 dark:border-border">
            <Button type="button" variant="outline" asChild>
              <Link href="/projects">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
