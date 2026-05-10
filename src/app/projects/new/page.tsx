"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { CustomerSelectWithAdd } from "@/components/customers/customer-select-with-add";
import { createProjectAction } from "../actions";

export default function NewProjectPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [status, setStatus] = React.useState<"active" | "pending" | "completed">("pending");
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [client, setClient] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitAttempted(true);
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
      <div className="flex flex-col gap-2">
        <Link
          href="/projects"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <PageHeader title="New Project" subtitle="Create a project with basic baseline fields." />
      </div>
      <Card className="max-w-[640px] p-5">
        <form onSubmit={handleSubmit} noValidate className="grid gap-3">
          <div className="space-y-1">
            <CustomerSelectWithAdd
              label="Link customer"
              value={customerId}
              onChange={(nextCustomerId, customer) => {
                setCustomerId(nextCustomerId);
                if (customer) {
                  setClient(customer.name ?? "");
                  setAddress(customer.address ?? "");
                }
              }}
            />
            <input type="hidden" name="customerId" value={customerId ?? ""} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Project Name</p>
            <Input
              name="name"
              placeholder="Luxury Villa E"
              required
              disabled={submitting}
              aria-invalid={submitAttempted && Boolean(error?.includes("Project name"))}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Client</p>
            <Input
              name="client"
              placeholder="Client or company name"
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                if (customerId) setCustomerId(null);
              }}
              required
              disabled={submitting}
              aria-invalid={submitAttempted && Boolean(error?.includes("Client name"))}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Address</p>
            <Input
              name="address"
              placeholder="Project address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              disabled={submitting}
              aria-invalid={submitAttempted && Boolean(error?.includes("address"))}
            />
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
          {error ? (
            <p role="alert" className="text-sm text-red-600/80">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-zinc-200/60 pt-3 dark:border-border sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/projects">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
