"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createProjectAction } from "../actions";

type AddressDetails = {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

const EMPTY_ADDRESS_DETAILS: AddressDetails = {
  street: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
};

function composeAddressSummary(details: AddressDetails) {
  const cityStateZip = [
    details.city.trim(),
    [details.state.trim(), details.zip.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const addressParts = [details.street.trim(), details.unit.trim(), cityStateZip].filter(Boolean);
  const summary = addressParts.join(", ");
  const notes = details.notes.trim();
  return notes ? [summary, `Access: ${notes}`].filter(Boolean).join(" - ") : summary;
}

function parseAddressSummary(summary: string): AddressDetails {
  const [addressPart = "", notesPart = ""] = summary.split(/\s+-\s+Access:\s*/);
  const parts = addressPart
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const [street = "", unit = "", city = "", stateZip = ""] = parts;
  const stateZipParts = stateZip.split(/\s+/).filter(Boolean);
  return {
    street,
    unit: parts.length > 3 ? unit : "",
    city: parts.length > 3 ? city : unit,
    state: stateZipParts[0] ?? "",
    zip: stateZipParts.slice(1).join(" "),
    notes: notesPart.trim(),
  };
}

function budgetDigits(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

function formatBudgetDisplay(value: string) {
  const digits = budgetDigits(value);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatCompactBudget(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  if (amount >= 1_000_000) {
    const formatted = (amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1);
    return `≈ $${formatted}m`;
  }
  if (amount >= 1_000) {
    const formatted = (amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1);
    return `≈ $${formatted}k`;
  }
  return `≈ $${amount}`;
}

export default function NewProjectPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [status, setStatus] = React.useState<"active" | "pending" | "completed">("pending");
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [client, setClient] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [addressDetails, setAddressDetails] = React.useState<AddressDetails>(EMPTY_ADDRESS_DETAILS);
  const [addressDraft, setAddressDraft] = React.useState<AddressDetails>(EMPTY_ADDRESS_DETAILS);
  const [addressOpen, setAddressOpen] = React.useState(false);
  const [customerNotice, setCustomerNotice] = React.useState<string | null>(null);
  const [budgetDisplay, setBudgetDisplay] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const autoFilled = React.useRef({ client: "", address: "" });
  const budgetValue = React.useMemo(() => budgetDigits(budgetDisplay), [budgetDisplay]);
  const compactBudget = React.useMemo(() => formatCompactBudget(budgetValue), [budgetValue]);

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
        setAddressDetails(parseAddressSummary(nextAddress));
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

  const openAddressEditor = React.useCallback(() => {
    const hasDetails = Object.values(addressDetails).some((value) => value.trim());
    setAddressDraft(hasDetails ? addressDetails : parseAddressSummary(address));
    setAddressOpen(true);
  }, [address, addressDetails]);

  const saveAddressDetails = React.useCallback(() => {
    const nextAddress = composeAddressSummary(addressDraft);
    setAddressDetails(addressDraft);
    setAddress(nextAddress);
    autoFilled.current.address = nextAddress;
    setAddressOpen(false);
  }, [addressDraft]);

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
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Address summary</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={openAddressEditor}
                disabled={submitting}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit details
              </Button>
            </div>
            <Input
              name="address"
              placeholder="Project address"
              value={address}
              required
              disabled={submitting}
              aria-invalid={submitAttempted && Boolean(error?.includes("address"))}
              onChange={(e) => {
                const nextAddress = e.target.value;
                setAddress(nextAddress);
                setAddressDetails(parseAddressSummary(nextAddress));
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Budget (USD)</p>
              <p className="text-[11px] font-medium text-muted-foreground">
                {compactBudget || "Estimated project budget"}
              </p>
            </div>
            <div className="group flex h-11 items-center overflow-hidden rounded-[10px] border border-input bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-emerald-500/15 dark:bg-card dark:focus-within:border-emerald-500/50">
              <div className="flex h-full items-center gap-2 border-r border-slate-900/[0.08] bg-muted/30 px-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground dark:border-border">
                <span>USD</span>
                <span className="font-mono text-sm tracking-normal text-foreground/80">$</span>
              </div>
              <input
                name="budget"
                aria-label="Budget"
                inputMode="numeric"
                pattern="[0-9,]*"
                autoComplete="off"
                placeholder="25,000"
                value={budgetDisplay}
                onChange={(e) => setBudgetDisplay(formatBudgetDisplay(e.target.value))}
                disabled={submitting}
                aria-invalid={submitAttempted && Boolean(error?.includes("Budget"))}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-right font-mono text-[15px] font-semibold tabular-nums tracking-[0.01em] text-foreground outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
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

      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent className="max-w-[520px] gap-4">
          <DialogHeader>
            <DialogTitle>Address details</DialogTitle>
            <DialogDescription>
              Save will update the one-line project address summary.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <label htmlFor="project-street" className="text-xs font-medium text-muted-foreground">
                Street address
              </label>
              <Input
                id="project-street"
                value={addressDraft.street}
                onChange={(e) => setAddressDraft((prev) => ({ ...prev, street: e.target.value }))}
                autoComplete="street-address"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="project-unit" className="text-xs font-medium text-muted-foreground">
                  Unit / Apt
                </label>
                <Input
                  id="project-unit"
                  value={addressDraft.unit}
                  onChange={(e) => setAddressDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  autoComplete="address-line2"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="project-city" className="text-xs font-medium text-muted-foreground">
                  City
                </label>
                <Input
                  id="project-city"
                  value={addressDraft.city}
                  onChange={(e) => setAddressDraft((prev) => ({ ...prev, city: e.target.value }))}
                  autoComplete="address-level2"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
              <div className="space-y-1.5">
                <label
                  htmlFor="project-state"
                  className="text-xs font-medium text-muted-foreground"
                >
                  State
                </label>
                <Input
                  id="project-state"
                  value={addressDraft.state}
                  onChange={(e) => setAddressDraft((prev) => ({ ...prev, state: e.target.value }))}
                  autoComplete="address-level1"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="project-zip" className="text-xs font-medium text-muted-foreground">
                  Zip code
                </label>
                <Input
                  id="project-zip"
                  value={addressDraft.zip}
                  onChange={(e) => setAddressDraft((prev) => ({ ...prev, zip: e.target.value }))}
                  autoComplete="postal-code"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="project-address-notes"
                className="text-xs font-medium text-muted-foreground"
              >
                Notes / access info
              </label>
              <Input
                id="project-address-notes"
                value={addressDraft.notes}
                onChange={(e) => setAddressDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Gate code, parking, or delivery notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddressOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveAddressDetails}>
              Save address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
