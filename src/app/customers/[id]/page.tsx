"use client";

import { ContactChannels, ContactSections } from "@/components/contacts/contact-sections";
import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import Link from "next/link";
import { financePathWithReturn } from "@/lib/finance-navigation";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoPanel,
  NeoSelect,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";

type CustomerRow = {
  id: string;
  name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
};

type CustomerForm = {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: "active" | "inactive";
};

type RelatedProject = {
  id: string;
  name: string;
  status: string;
  customerId?: string | null;
  sourceEstimateId?: string | null;
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

type CustomerDetailResponse = CustomerRow & {
  projects_count?: number;
};

async function readCustomerDetail(id: string): Promise<CustomerDetailResponse> {
  const res = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as
    | (Partial<CustomerDetailResponse> & { message?: string })
    | null;
  if (!res.ok || !body) {
    throw new Error(body?.message || "Failed to load customer.");
  }
  return body as CustomerDetailResponse;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [projects, setProjects] = React.useState<RelatedProject[] | null>(null);
  const [form, setForm] = React.useState<CustomerForm>({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    status: "active",
  });
  /** Last server-aligned form; used to rollback on failed save without refetching. */
  const serverFormRef = React.useRef<CustomerForm | null>(null);

  const refresh = React.useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    serverFormRef.current = null;
    setProjects(null);
    setMessage(null);
    setNotFound(false);
    let row: CustomerDetailResponse;
    try {
      row = await readCustomerDetail(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load customer.";
      if (/not found/i.test(message)) setNotFound(true);
      setMessage(message);
      setLoading(false);
      return;
    }
    const next: CustomerForm = {
      name: row.name ?? "",
      contact_person: row.contact_person ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      status: row.status === "inactive" ? "inactive" : "active",
    };
    setForm(next);
    serverFormRef.current = { ...next };
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.projects)) throw new Error("Projects unavailable");
      setProjects(payload.projects.filter((project: RelatedProject) => project.customerId === id));
    } catch {
      setProjects(null);
    }
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  useBreadcrumbEntityLabel(!loading && !notFound && form.name.trim() ? form.name : null);

  const handleSave = React.useCallback(() => {
    if (!id) {
      setMessage("Customer is not available.");
      return;
    }
    const baseline = serverFormRef.current;
    if (!baseline) return;

    const payload = {
      name: toNullable(form.name),
      contact_person: toNullable(form.contact_person),
      phone: toNullable(form.phone),
      email: toNullable(form.email),
      address: toNullable(form.address),
      notes: toNullable(form.notes),
      status: form.status,
    };
    const formCommitted = { ...form };

    type Snap = { serverForm: CustomerForm; message: string | null };
    runOptimisticPersist<Snap>({
      setBusy: setSaving,
      getSnapshot: () => ({ serverForm: { ...baseline }, message }),
      apply: () => {
        setMessage("Customer saved.");
      },
      rollback: (s) => {
        setForm(s.serverForm);
        setMessage(s.message);
      },
      onError: (msg) => setMessage(msg),
      persist: async () => {
        const res = await fetch(`/api/customers/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => null)) as
          | (Partial<CustomerRow> & { message?: string })
          | null;
        if (!res.ok || !body) return { error: body?.message || "Failed to save customer." };
        return undefined;
      },
      onSuccess: () => {
        serverFormRef.current = { ...formCommitted };
      },
    });
  }, [form, id, message]);

  if (loading) {
    return (
      <PageLayout header={null} divider={false}>
        <LoadingState text="Loading customer..." />
      </PageLayout>
    );
  }

  if (notFound) {
    return (
      <PageLayout
        divider={false}
        header={
          <PageHeader
            title="Customer not found"
            description="The selected customer does not exist."
          />
        }
      >
        <EmptyState
          title="Customer not found"
          description="Return to the customer directory to choose another profile."
        />
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/customers">Back to Customers</Link>
        </Button>
      </PageLayout>
    );
  }

  if (!serverFormRef.current)
    return (
      <PageLayout divider={false} header={<PageHeader title="Customer unavailable" />}>
        <p role="status">{message || "Could not load this customer."}</p>
        <Button className="min-h-11" onClick={() => void refresh()}>
          Retry customer
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/customers">Back to Customers</Link>
        </Button>
      </PageLayout>
    );

  const projectLinks = (target: "project" | "documents" | "history") =>
    projects === null ? (
      <p role="status">Project links unavailable. Reload the customer to retry.</p>
    ) : (
      <div className="space-y-2">
        {projects.length === 0 && (
          <p className="text-sm text-[var(--hh-text-secondary)]">
            No projects with a recorded customer link. Legacy name-only associations are not
            included.
          </p>
        )}
        {projects.map((project) => (
          <Button
            key={project.id}
            asChild
            variant="outline"
            className="min-h-11 max-w-full h-auto whitespace-normal justify-start"
          >
            <Link
              href={
                target === "documents"
                  ? `/documents?project_id=${encodeURIComponent(project.id)}`
                  : `/projects/${project.id}${target === "history" ? "?tab=activity" : ""}`
              }
              prefetch={false}
            >
              {project.name}
              {target === "documents" ? " · Documents" : target === "history" ? " · History" : ""}
            </Link>
          </Button>
        ))}
      </div>
    );
  const financeLink = (label: string, href: string) => (
    <NeoPanel title={label} bodyClassName="space-y-3 p-4">
      <p className="text-sm text-[var(--hh-text-secondary)]">
        Open this customer’s records in Finance.
      </p>
      <Button asChild variant="outline" className="min-h-11">
        <Link
          href={financePathWithReturn(
            `${href}?customerId=${encodeURIComponent(id!)}`,
            `/customers/${id}?${searchParams}`
          )}
          prefetch={false}
        >
          {label}
        </Link>
      </Button>
    </NeoPanel>
  );

  return (
    <PageLayout
      className="[&_button]:min-h-11"
      divider={false}
      header={
        <PageHeader
          title={form.name?.trim() || "Customer"}
          description="View and edit customer profile."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => router.push("/customers")}
              >
                Back
              </Button>
              <Button size="sm" className="min-h-11" onClick={handleSave} disabled={saving}>
                <SubmitSpinner loading={saving} className="mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          }
        />
      }
    >
      {message ? (
        <div className="rounded-hh-standard border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-3 py-2 text-hh-body text-[var(--hh-information)]">
          {message}
        </div>
      ) : null}

      <ContactChannels phone={serverFormRef.current.phone} email={serverFormRef.current.email} />
      <ContactSections
        sections={[
          {
            label: "Overview",
            content: (
              <>
                {" "}
                <NeoPanel bodyClassName="p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <NeoFieldLabel>Customer Name</NeoFieldLabel>
                      <NeoInput
                        aria-label="Customer Name"
                        className="min-h-11"
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <NeoFieldLabel>Contact Person</NeoFieldLabel>
                      <NeoInput
                        aria-label="Contact Person"
                        className="min-h-11"
                        value={form.contact_person}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, contact_person: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <NeoFieldLabel>Phone</NeoFieldLabel>
                      <NeoInput
                        aria-label="Phone"
                        className="min-h-11"
                        value={form.phone}
                        onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <NeoFieldLabel>Email</NeoFieldLabel>
                      <NeoInput
                        aria-label="Email"
                        className="min-h-11"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <NeoFieldLabel>Address</NeoFieldLabel>
                      <NeoInput
                        aria-label="Address"
                        className="min-h-11"
                        value={form.address}
                        onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <NeoFieldLabel>Notes</NeoFieldLabel>
                      <NeoInput
                        aria-label="Notes"
                        className="min-h-11"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <NeoFieldLabel>Status</NeoFieldLabel>
                      <NeoSelect
                        aria-label="Status"
                        className="min-h-11"
                        value={form.status}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            status: e.target.value === "inactive" ? "inactive" : "active",
                          }))
                        }
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </NeoSelect>
                    </div>
                  </div>
                </NeoPanel>
                {financeLink("Customer AR", "/financial/ar")}
              </>
            ),
          },
          { label: "Projects", content: projectLinks("project") },
          {
            label: "Estimates",
            content: (
              <div className="space-y-3">
                <p className="text-sm text-[var(--hh-text-secondary)]">
                  Estimates linked through this customer’s projects. Other customer-specific
                  estimate history is unavailable here.
                </p>
                {projects
                  ?.filter((project) => project.sourceEstimateId)
                  .map((project) => (
                    <Button key={project.id} asChild variant="outline" className="min-h-11">
                      <Link href={`/estimates/${project.sourceEstimateId}`} prefetch={false}>
                        {project.name} · Estimate
                      </Link>
                    </Button>
                  ))}
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/estimates" prefetch={false}>
                    Open Estimates
                  </Link>
                </Button>
              </div>
            ),
          },
          {
            label: "Invoices",
            content: financeLink("Open customer invoices", "/financial/invoices"),
          },
          {
            label: "Payments",
            content: financeLink("Open payments received", "/financial/payments"),
          },
          { label: "Documents", content: projectLinks("documents") },
          {
            label: "History",
            content: (
              <>
                <p className="text-sm text-[var(--hh-text-secondary)]">
                  Activity is recorded within each project.
                </p>
                {projectLinks("history")}
              </>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
