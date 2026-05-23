"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  NeoActionFooter,
  NeoFieldLabel,
  NeoFormGrid,
  NeoFormSection,
  NeoInput,
  NeoPanel,
  NeoSelect,
  neoFormErrorClassName,
  neoFormFieldClassName,
  neoFormNoticeClassName,
} from "@/components/base";
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
    <div className="dark neo-page-on-graphite page-container page-stack py-6 text-[var(--neo-canvas-text-secondary)]">
      <div className="flex flex-col gap-2">
        <Link
          href="/projects"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--neo-canvas-text-secondary)] transition-colors hover:text-[var(--neo-canvas-text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <PageHeader title="New Project" subtitle="Create a project with basic baseline fields." />
      </div>
      <NeoPanel className="max-w-[640px]" bodyClassName="p-5">
        <form onSubmit={handleSubmit} noValidate className="grid gap-3">
          <div className="space-y-1">
            <CustomerSelectWithAdd
              label="Link customer"
              value={customerId}
              onChange={applyCustomerSelection}
            />
            <input type="hidden" name="customerId" value={customerId ?? ""} />
            {customerNotice ? <p className={neoFormNoticeClassName}>{customerNotice}</p> : null}
          </div>
          <NeoFormSection>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor="new-project-name">Project Name</NeoFieldLabel>
              <NeoInput
                id="new-project-name"
                name="name"
                placeholder="Luxury Villa E"
                required
                disabled={submitting}
                aria-invalid={submitAttempted && Boolean(error?.includes("Project name"))}
              />
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor="new-project-client">Client</NeoFieldLabel>
              <NeoInput
                id="new-project-client"
                name="client"
                placeholder="Client or company name"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                required
                disabled={submitting}
                aria-invalid={submitAttempted && Boolean(error?.includes("Client name"))}
              />
            </div>
          </NeoFormSection>
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
          <NeoFormGrid className="sm:grid-cols-1">
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor="new-project-status">Status</NeoFieldLabel>
              <NeoSelect
                id="new-project-status"
                name="status"
                value={status}
                onChange={(e) =>
                  setStatus((e.target.value as "active" | "pending" | "completed") ?? "pending")
                }
                disabled={submitting}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </NeoSelect>
            </div>
          </NeoFormGrid>
          {error ? (
            <p role="alert" className={neoFormErrorClassName}>
              {error}
            </p>
          ) : null}
          <NeoActionFooter>
            <Button type="button" variant="outline" asChild>
              <Link href="/projects">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting ? "Creating…" : "Create Project"}
            </Button>
          </NeoActionFooter>
        </form>
      </NeoPanel>
    </div>
  );
}
