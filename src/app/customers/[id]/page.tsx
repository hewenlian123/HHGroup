"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoPanel,
  NeoSelect,
  NeoStatus,
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
  name: string | null;
  status: string | null;
  client: string | null;
  customer_id: string | null;
};

type RelatedEstimate = {
  id: string;
  number: string | null;
  client: string | null;
  project: string | null;
  status: string | null;
};

type RelatedChangeOrder = {
  id: string;
  project_id: string;
  number: string | null;
  title?: string | null;
  status: string | null;
};

type RelatedWork = {
  projects: RelatedProject[];
  estimates: RelatedEstimate[];
  changeOrders: RelatedChangeOrder[];
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

type CustomerDetailResponse = CustomerRow & {
  projects_count?: number;
  relatedWork?: RelatedWork;
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
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [relatedWork, setRelatedWork] = React.useState<RelatedWork>({
    projects: [],
    estimates: [],
    changeOrders: [],
  });
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
    setRelatedWork(row.relatedWork ?? { projects: [], estimates: [], changeOrders: [] });
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

  return (
    <PageLayout
      divider={false}
      header={
        <PageHeader
          title={form.name?.trim() || "Customer"}
          description="View and edit customer profile."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/customers")}>
                Back
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
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

      <NeoPanel bodyClassName="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <NeoFieldLabel>Customer Name</NeoFieldLabel>
            <NeoInput
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Contact Person</NeoFieldLabel>
            <NeoInput
              value={form.contact_person}
              onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Phone</NeoFieldLabel>
            <NeoInput
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Email</NeoFieldLabel>
            <NeoInput
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <NeoFieldLabel>Address</NeoFieldLabel>
            <NeoInput
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <NeoFieldLabel>Notes</NeoFieldLabel>
            <NeoInput
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Status</NeoFieldLabel>
            <NeoSelect
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

      <NeoPanel bodyClassName="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--hh-text-primary)]">Related work</h2>
            <p className="text-xs text-[var(--hh-text-secondary)]">
              Projects, estimates, and change orders connected to this customer.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
              Projects
            </p>
            {relatedWork.projects.length === 0 ? (
              <p className="text-sm text-[var(--hh-text-secondary)]">No related projects.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {relatedWork.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm underline-offset-2 hover:underline"
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--hh-text-primary)]">
                      {project.name ?? "Untitled project"}
                    </span>
                    <NeoStatus label={project.status ?? "—"} variant="default" />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
              Estimates
            </p>
            {relatedWork.estimates.length === 0 ? (
              <p className="text-sm text-[var(--hh-text-secondary)]">No related estimates.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {relatedWork.estimates.map((estimate) => (
                  <Link
                    key={estimate.id}
                    href={`/estimates/${estimate.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm underline-offset-2 hover:underline"
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--hh-text-primary)]">
                      {estimate.number ?? "Estimate"}
                    </span>
                    <NeoStatus label={estimate.status ?? "—"} variant="default" />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-hh-table-header uppercase text-[var(--hh-text-tertiary)]">
              Change Orders
            </p>
            {relatedWork.changeOrders.length === 0 ? (
              <p className="text-sm text-[var(--hh-text-secondary)]">No related change orders.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {relatedWork.changeOrders.map((co) => (
                  <Link
                    key={co.id}
                    href={`/projects/${co.project_id}/change-orders/${co.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm underline-offset-2 hover:underline"
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--hh-text-primary)]">
                      {co.title ?? co.number ?? "Change order"}
                    </span>
                    <NeoStatus label={co.status ?? "—"} variant="default" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </NeoPanel>
    </PageLayout>
  );
}
