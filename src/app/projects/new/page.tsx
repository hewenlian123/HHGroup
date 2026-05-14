"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";
import {
  ProjectAddressField,
  ProjectBudgetInput,
} from "@/components/projects/project-form-controls";
import { createProjectAction } from "../actions";

export default function NewProjectPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [status, setStatus] = React.useState<"active" | "pending" | "completed">("pending");
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [client, setClient] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [customerNotice, setCustomerNotice] = React.useState<string | null>(null);
  const [budgetValue, setBudgetValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const autoFilled = React.useRef({ client: "", address: "" });

  const applyCustomerSelection = React.useCallback(
    (nextCustomerId: string | null, customer?: CustomerOption | null) => {
      if (!nextCustomerId || !customer) {
        setCustomerId(null);
        setCustomerNotice(null);
        return;
      }

      const filled: string[] = [];
      const kept: string[] = [];
      const nextClient = customer.name?.trim() ?? "";
      const nextAddress = customer.address?.trim() ?? "";
      const shouldFillClient =
        !!nextClient &&
        (!client.trim() || (!!autoFilled.current.client && client === autoFilled.current.client));
      const shouldFillAddress =
        !!nextAddress &&
        (!address.trim() ||
          (!!autoFilled.current.address && address === autoFilled.current.address));

      setCustomerId(nextCustomerId);

      if (shouldFillClient) {
        autoFilled.current.client = nextClient;
        setClient(nextClient);
        filled.push("Client");
      } else if (nextClient) {
        kept.push("Client");
      }

      if (shouldFillAddress) {
        autoFilled.current.address = nextAddress;
        setAddress(nextAddress);
        filled.push("Address");
      } else if (nextAddress) {
        kept.push("Address");
      }

      const prefix = `Linked ${nextClient || "customer"}.`;
      if (filled.length && kept.length) {
        setCustomerNotice(
          `${prefix} Filled ${filled.join(" and ")}; kept your existing ${kept.join(" and ")}.`
        );
      } else if (filled.length) {
        setCustomerNotice(`${prefix} Filled ${filled.join(" and ")} from the customer profile.`);
      } else if (kept.length) {
        setCustomerNotice(`${prefix} Kept existing form values to avoid overwriting your edits.`);
      } else {
        setCustomerNotice(prefix);
      }
    },
    [address, client]
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitAttempted(true);
      setError(null);
      setSubmitting(true);
      const formData = new FormData(e.currentTarget);
      formData.set("budget", budgetValue);
      const result = await createProjectAction(null, formData);
      if (result?.error) setError(result.error);
      setSubmitting(false);
    },
    [budgetValue, submitting]
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
              onChange={applyCustomerSelection}
            />
            <input type="hidden" name="customerId" value={customerId ?? ""} />
            {customerNotice ? (
              <p className="rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
                {customerNotice}
              </p>
            ) : null}
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
              onChange={(e) => setClient(e.target.value)}
              required
              disabled={submitting}
              aria-invalid={submitAttempted && Boolean(error?.includes("Client name"))}
            />
          </div>
          <ProjectAddressField
            value={address}
            onChange={setAddress}
            required
            disabled={submitting}
            error={submitAttempted && Boolean(error?.includes("address"))}
          />
          <ProjectBudgetInput
            value={budgetValue}
            onValueChange={setBudgetValue}
            disabled={submitting}
            error={submitAttempted && Boolean(error?.includes("Budget"))}
          />
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
