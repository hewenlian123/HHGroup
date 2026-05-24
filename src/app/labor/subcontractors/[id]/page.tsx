"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  EmptyState,
  LoadingState,
  NeoActionFooter,
  NeoAmount,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoMobileCard,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

type SubcontractorRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id_last4: string | null;
  w9_on_file: boolean;
  insurance_expiration: string | null;
  license_number: string | null;
  notes: string | null;
  status: "active" | "inactive";
};

type AttachmentRow = {
  id: string;
  created_at: string;
  entity_type: "subcontractor" | "bill";
  entity_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type ProjectOption = { id: string; name: string | null };
type ProjectLink = {
  id: string;
  project_id: string;
  subcontractor_id: string;
  role: string | null;
  agreed_rate_type: string | null;
  agreed_rate: number | null;
  projects?: { id: string; name: string | null } | null;
};

type ProjectLinkRaw = Omit<ProjectLink, "projects"> & {
  projects?:
    | Array<{ id: string; name: string | null }>
    | { id: string; name: string | null }
    | null;
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
};

const detailHeadClass =
  "h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]";
const detailCellClass = "border-b border-[var(--neo-border)] px-3 py-2 align-middle text-[13px]";

function statusVariant(status: SubcontractorRow["status"]) {
  return status === "active" ? "success" : "muted";
}

export default function SubcontractorDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [tab, setTab] = React.useState<"profile" | "docs" | "projects">("profile");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [row, setRow] = React.useState<SubcontractorRow | null>(null);
  const [attachments, setAttachments] = React.useState<AttachmentRow[]>([]);
  const [links, setLinks] = React.useState<ProjectLink[]>([]);
  const [projectOptions, setProjectOptions] = React.useState<ProjectOption[]>([]);
  const [linking, setLinking] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [linkProjectId, setLinkProjectId] = React.useState("");
  const [linkRole, setLinkRole] = React.useState("");
  const [linkRateType, setLinkRateType] = React.useState("");
  const [linkRate, setLinkRate] = React.useState("");

  const refresh = React.useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    setNotFound(false);
    try {
      const [subRes, attachmentRes, linkRes, projectRes] = await Promise.all([
        supabase.from("subcontractors").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("attachments")
          .select("*")
          .eq("entity_type", "subcontractor")
          .eq("entity_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_subcontractors")
          .select(
            "id,project_id,subcontractor_id,role,agreed_rate_type,agreed_rate,projects(id,name)"
          )
          .eq("subcontractor_id", id)
          .order("created_at", { ascending: false }),
        supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
      ]);
      if (subRes.error) throw subRes.error;
      if (attachmentRes.error) throw attachmentRes.error;
      if (linkRes.error) throw linkRes.error;
      if (projectRes.error) throw projectRes.error;
      if (!subRes.data) {
        setNotFound(true);
        setRow(null);
      } else {
        setRow(subRes.data as SubcontractorRow);
      }
      setAttachments((attachmentRes.data ?? []) as AttachmentRow[]);
      const normalizedLinks = ((linkRes.data ?? []) as unknown as ProjectLinkRaw[]).map((row) => ({
        ...row,
        projects: one(row.projects),
      }));
      setLinks(normalizedLinks);
      setProjectOptions((projectRes.data ?? []) as ProjectOption[]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(msg || "Failed to load subcontractor.");
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  useBreadcrumbEntityLabel(!loading && !notFound && row?.display_name ? row.display_name : null);

  const handleSave = React.useCallback(async () => {
    if (!id || !supabase || !row) return;
    if (!row.display_name.trim()) {
      setMessage("Display name is required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const payload = {
      display_name: row.display_name.trim(),
      legal_name: toNullable(row.legal_name ?? ""),
      contact_name: toNullable(row.contact_name ?? ""),
      phone: toNullable(row.phone ?? ""),
      email: toNullable(row.email ?? ""),
      address1: toNullable(row.address1 ?? ""),
      address2: toNullable(row.address2 ?? ""),
      city: toNullable(row.city ?? ""),
      state: toNullable(row.state ?? ""),
      zip: toNullable(row.zip ?? ""),
      tax_id_last4: toNullable(row.tax_id_last4 ?? ""),
      w9_on_file: row.w9_on_file,
      insurance_expiration: row.insurance_expiration || null,
      license_number: toNullable(row.license_number ?? ""),
      notes: toNullable(row.notes ?? ""),
      status: row.status === "inactive" ? "inactive" : "active",
    };
    try {
      const { error } = await supabase.from("subcontractors").update(payload).eq("id", id);
      if (error) throw error;
      setMessage("Subcontractor saved.");
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(msg || "Failed to save subcontractor.");
    } finally {
      setSaving(false);
    }
  }, [id, refresh, row, supabase]);

  const handleLinkProject = React.useCallback(async () => {
    if (!id || !supabase || !linkProjectId) return;
    setLinking(true);
    setMessage(null);
    try {
      const payload = {
        project_id: linkProjectId,
        subcontractor_id: id,
        role: toNullable(linkRole),
        agreed_rate_type: toNullable(linkRateType),
        agreed_rate: linkRate.trim() ? Number(linkRate) : null,
      };
      const { error } = await supabase
        .from("project_subcontractors")
        .upsert([payload], { onConflict: "project_id,subcontractor_id" });
      if (error) throw error;
      setLinkProjectId("");
      setLinkRole("");
      setLinkRateType("");
      setLinkRate("");
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(msg || "Failed to link project.");
    } finally {
      setLinking(false);
    }
  }, [id, linkProjectId, linkRate, linkRateType, linkRole, refresh, supabase]);

  const handleUnlink = React.useCallback(
    async (linkId: string) => {
      if (!supabase) return;
      const prevLinks = links;
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      try {
        const { error } = await supabase.from("project_subcontractors").delete().eq("id", linkId);
        if (error) throw error;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessage(msg || "Failed to unlink project.");
        setLinks(prevLinks);
      }
    },
    [links, supabase]
  );

  const handleUpload = React.useCallback(
    async (file: File) => {
      if (!id || !supabase) return;
      setUploading(true);
      setMessage(null);
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `attachments/subcontractors/${id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(path, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });
        if (uploadError) throw uploadError;
        const { error: rowError } = await supabase.from("attachments").insert([
          {
            entity_type: "subcontractor",
            entity_id: id,
            file_name: file.name,
            file_path: path,
            mime_type: file.type || null,
            size_bytes: file.size,
          },
        ]);
        if (rowError) throw rowError;
        await refresh();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessage(msg || "Failed to upload attachment.");
      } finally {
        setUploading(false);
      }
    },
    [id, refresh, supabase]
  );

  const handleOpenAttachment = React.useCallback(
    async (filePath: string) => {
      if (!supabase) return;
      const { data, error } = await supabase.storage
        .from("attachments")
        .createSignedUrl(filePath, 60);
      if (error || !data?.signedUrl) {
        setMessage(error?.message || "Failed to open file.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    },
    [supabase]
  );

  const handleDeleteAttachment = React.useCallback(
    async (attachment: AttachmentRow) => {
      if (!supabase) return;
      const prevAttachments = attachments;
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      try {
        const { error: storageError } = await supabase.storage
          .from("attachments")
          .remove([attachment.file_path]);
        if (storageError) throw storageError;
        const { error: dbError } = await supabase
          .from("attachments")
          .delete()
          .eq("id", attachment.id);
        if (dbError) throw dbError;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessage(msg || "Failed to delete attachment.");
        setAttachments(prevAttachments);
      }
    },
    [attachments, supabase]
  );

  if (loading) {
    return (
      <PageLayout
        divider={false}
        className="dark"
        header={
          <PageHeader
            title="Subcontractor"
            description="Loading compliance profile and linked work."
          />
        }
      >
        <LoadingState text="Loading subcontractor..." />
      </PageLayout>
    );
  }

  if (notFound || !row) {
    return (
      <PageLayout
        divider={false}
        className="dark"
        header={
          <PageHeader
            title="Subcontractor not found"
            description="The selected subcontractor does not exist."
          />
        }
      >
        <Button asChild variant="outline" className="w-fit">
          <Link href="/labor/subcontractors">Back to Subcontractors</Link>
        </Button>
      </PageLayout>
    );
  }

  const insuranceExpired = row.insurance_expiration
    ? new Date(row.insurance_expiration).getTime() < Date.now()
    : false;

  return (
    <PageLayout
      divider={false}
      className="dark"
      header={
        <PageHeader
          title={row.display_name}
          description="Subcontractor profile, compliance docs, and linked projects."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-sm">
                <Link href="/labor/subcontractors">Back</Link>
              </Button>
              <Button
                size="sm"
                className="rounded-sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                <SubmitSpinner loading={saving} className="mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          }
        />
      }
    >
      {message ? (
        <div
          className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2 text-sm text-[var(--neo-text-secondary)]"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <NeoToolbar className="flex-row flex-wrap">
        <Button
          variant={tab === "profile" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("profile")}
        >
          Profile
        </Button>
        <Button
          variant={tab === "docs" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("docs")}
        >
          Docs / Attachments
        </Button>
        <Button
          variant={tab === "projects" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("projects")}
        >
          Linked Projects
        </Button>
      </NeoToolbar>

      {tab === "profile" ? (
        <NeoPanel
          title="Profile"
          description="Core directory details used by project teams and compliance checks."
          bodyClassName="p-4"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <NeoStatus label={row.status} variant={statusVariant(row.status)} />
            <NeoStatus
              label={row.w9_on_file ? "W9 on file" : "W9 missing"}
              variant={row.w9_on_file ? "success" : "warning"}
            />
            <span className="text-xs text-[var(--neo-text-secondary)]">
              W9: {row.w9_on_file ? "On file" : "Missing"} · Insurance:{" "}
              {row.insurance_expiration ?? "N/A"}
              {insuranceExpired ? " (Expired)" : ""}
            </span>
          </div>
          <NeoFormGrid>
            <div className="space-y-1">
              <NeoFieldLabel required>Display Name</NeoFieldLabel>
              <NeoInput
                value={row.display_name}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, display_name: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Legal Name</NeoFieldLabel>
              <NeoInput
                value={row.legal_name ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, legal_name: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Contact Name</NeoFieldLabel>
              <NeoInput
                value={row.contact_name ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, contact_name: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Phone</NeoFieldLabel>
              <NeoInput
                value={row.phone ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, phone: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Email</NeoFieldLabel>
              <NeoInput
                value={row.email ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, email: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Status</NeoFieldLabel>
              <NeoSelect
                value={row.status}
                onChange={(event) =>
                  setRow((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: event.target.value === "inactive" ? "inactive" : "active",
                        }
                      : prev
                  )
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </NeoSelect>
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>W9 on file</NeoFieldLabel>
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 text-sm text-[var(--neo-text-primary)]">
                <input
                  type="checkbox"
                  checked={row.w9_on_file}
                  onChange={(event) =>
                    setRow((prev) => (prev ? { ...prev, w9_on_file: event.target.checked } : prev))
                  }
                />
                Yes
              </label>
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Insurance Expiration</NeoFieldLabel>
              <NeoInput
                type="date"
                value={row.insurance_expiration ?? ""}
                onChange={(event) =>
                  setRow((prev) =>
                    prev ? { ...prev, insurance_expiration: event.target.value || null } : prev
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>License Number</NeoFieldLabel>
              <NeoInput
                value={row.license_number ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, license_number: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Tax ID Last 4</NeoFieldLabel>
              <NeoInput
                value={row.tax_id_last4 ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, tax_id_last4: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Address Line 1</NeoFieldLabel>
              <NeoInput
                value={row.address1 ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, address1: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Address Line 2</NeoFieldLabel>
              <NeoInput
                value={row.address2 ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, address2: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>City</NeoFieldLabel>
              <NeoInput
                value={row.city ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, city: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>State</NeoFieldLabel>
              <NeoInput
                value={row.state ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, state: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>ZIP</NeoFieldLabel>
              <NeoInput
                value={row.zip ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, zip: event.target.value } : prev))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoInput
                value={row.notes ?? ""}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, notes: event.target.value } : prev))
                }
              />
            </div>
          </NeoFormGrid>
          <NeoActionFooter className="-mx-4 mt-4 px-4 sm:mx-0 sm:px-0">
            <Button asChild variant="outline" size="sm" className="rounded-sm">
              <Link href="/labor/subcontractors">Back</Link>
            </Button>
            <Button
              size="sm"
              className="rounded-sm"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </NeoActionFooter>
        </NeoPanel>
      ) : null}

      {tab === "docs" ? (
        <NeoPanel
          title="Docs / Attachments"
          description="Store W9, COI, and contract files without changing upload workflow."
          bodyClassName="space-y-4 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <NeoInput
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
                event.currentTarget.value = "";
              }}
              disabled={uploading}
              className="max-w-[360px]"
            />
            <span className="text-xs text-[var(--neo-text-secondary)]">
              {uploading ? "Uploading..." : "Upload W9 / COI / contract PDF."}
            </span>
          </div>
          <div className="space-y-2 md:hidden">
            {attachments.map((item) => (
              <NeoMobileCard key={item.id} className="p-3">
                <p className="truncate font-medium text-[var(--neo-text-primary)]">
                  {item.file_name}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--neo-text-secondary)]">
                  <div>
                    <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                      Type
                    </dt>
                    <dd className="mt-1 truncate">{item.mime_type || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                      Size
                    </dt>
                    <dd className="mt-1">
                      {item.size_bytes != null ? `${Math.round(item.size_bytes / 1024)} KB` : "—"}
                    </dd>
                  </div>
                </dl>
                <p className={cn("mt-2 text-xs", LEDGER_DATE_CLASS)}>
                  {formatLedgerDate(item.created_at)}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 rounded-sm"
                    onClick={() => void handleOpenAttachment(item.file_path)}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 rounded-sm"
                    onClick={() => void handleDeleteAttachment(item)}
                  >
                    Delete
                  </Button>
                </div>
              </NeoMobileCard>
            ))}
            {attachments.length === 0 ? (
              <EmptyState title="No attachments" description="No compliance files uploaded yet." />
            ) : null}
          </div>
          <NeoTable className="hidden md:block" tableClassName="min-w-[720px] lg:min-w-0">
            <thead>
              <tr>
                <th className={detailHeadClass}>File</th>
                <th className={detailHeadClass}>Type</th>
                <th className={detailHeadClass}>Size</th>
                <th className={detailHeadClass}>Created</th>
                <th className={cn(detailHeadClass, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child>td]:border-b-0">
              {attachments.map((item) => (
                <tr key={item.id} className={listTableRowStaticClassName}>
                  <td className={cn(detailCellClass, "font-medium text-[var(--neo-text-primary)]")}>
                    {item.file_name}
                  </td>
                  <td className={cn(detailCellClass, "text-[var(--neo-text-secondary)]")}>
                    {item.mime_type || "—"}
                  </td>
                  <td className={cn(detailCellClass, "text-[var(--neo-text-secondary)]")}>
                    {item.size_bytes != null ? `${Math.round(item.size_bytes / 1024)} KB` : "—"}
                  </td>
                  <td className={detailCellClass}>
                    <span className={LEDGER_DATE_CLASS}>{formatLedgerDate(item.created_at)}</span>
                  </td>
                  <td className={detailCellClass}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-sm px-3"
                        onClick={() => void handleOpenAttachment(item.file_path)}
                      >
                        Open
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-sm px-3"
                        onClick={() => void handleDeleteAttachment(item)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {attachments.length === 0 ? (
                <tr>
                  <td className="px-3 py-6" colSpan={5}>
                    <EmptyState
                      title="No attachments"
                      description="No compliance files uploaded yet."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </NeoTable>
        </NeoPanel>
      ) : null}

      {tab === "projects" ? (
        <>
          <NeoPanel
            title="Link project"
            description="Associate this subcontractor with active project work."
            bodyClassName="p-4"
          >
            <NeoFormGrid className="lg:grid-cols-4">
              <div className="space-y-1">
                <NeoFieldLabel>Project</NeoFieldLabel>
                <NeoSelect
                  value={linkProjectId}
                  onChange={(event) => setLinkProjectId(event.target.value)}
                >
                  <option value="">Select project</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name || project.id}
                    </option>
                  ))}
                </NeoSelect>
              </div>
              <div className="space-y-1">
                <NeoFieldLabel>Role</NeoFieldLabel>
                <NeoInput
                  value={linkRole}
                  onChange={(event) => setLinkRole(event.target.value)}
                  placeholder="Role (e.g. roofing)"
                />
              </div>
              <div className="space-y-1">
                <NeoFieldLabel>Rate type</NeoFieldLabel>
                <NeoSelect
                  value={linkRateType}
                  onChange={(event) => setLinkRateType(event.target.value)}
                >
                  <option value="">Rate type</option>
                  <option value="fixed">fixed</option>
                  <option value="t&m">t&m</option>
                  <option value="unit">unit</option>
                </NeoSelect>
              </div>
              <div className="space-y-1">
                <NeoFieldLabel>Rate</NeoFieldLabel>
                <NeoInput
                  value={linkRate}
                  onChange={(event) => setLinkRate(event.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                />
              </div>
            </NeoFormGrid>
            <NeoActionFooter className="-mx-4 mt-4 px-4 sm:mx-0 sm:px-0">
              <Button
                size="sm"
                className="rounded-sm"
                onClick={() => void handleLinkProject()}
                disabled={linking || !linkProjectId}
              >
                {linking ? "Linking..." : "Link to Project"}
              </Button>
            </NeoActionFooter>
          </NeoPanel>

          <NeoPanel title="Linked projects" bodyClassName="p-4 md:p-0">
            <div className="space-y-2 md:hidden">
              {links.map((link) => (
                <NeoMobileCard key={link.id} className="p-3">
                  <p className="font-medium text-[var(--neo-text-primary)]">
                    {link.projects?.name || link.project_id}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--neo-text-secondary)]">
                    <div>
                      <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                        Role
                      </dt>
                      <dd className="mt-1">{link.role || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                        Rate
                      </dt>
                      <dd className="mt-1">
                        <NeoAmount>
                          {link.agreed_rate != null
                            ? formatCurrency(Number(link.agreed_rate))
                            : "—"}
                        </NeoAmount>
                      </dd>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-8 w-full rounded-sm"
                    onClick={() => void handleUnlink(link.id)}
                  >
                    Unlink
                  </Button>
                </NeoMobileCard>
              ))}
              {links.length === 0 ? (
                <EmptyState title="No linked projects" description="No linked projects yet." />
              ) : null}
            </div>
            <NeoTable
              className="hidden md:block border-0 shadow-none"
              tableClassName="min-w-[720px] lg:min-w-0"
            >
              <thead>
                <tr>
                  <th className={detailHeadClass}>Project</th>
                  <th className={detailHeadClass}>Role</th>
                  <th className={detailHeadClass}>Rate type</th>
                  <th className={cn(detailHeadClass, "text-right")}>Rate</th>
                  <th className={cn(detailHeadClass, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child>td]:border-b-0">
                {links.map((link) => (
                  <tr key={link.id} className={listTableRowStaticClassName}>
                    <td
                      className={cn(detailCellClass, "font-medium text-[var(--neo-text-primary)]")}
                    >
                      {link.projects?.name || link.project_id}
                    </td>
                    <td className={cn(detailCellClass, "text-[var(--neo-text-secondary)]")}>
                      {link.role || "—"}
                    </td>
                    <td className={cn(detailCellClass, "text-[var(--neo-text-secondary)]")}>
                      {link.agreed_rate_type || "—"}
                    </td>
                    <td className={cn(detailCellClass, "text-right")}>
                      <NeoAmount>
                        {link.agreed_rate != null ? formatCurrency(Number(link.agreed_rate)) : "—"}
                      </NeoAmount>
                    </td>
                    <td className={detailCellClass}>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-sm px-3"
                          onClick={() => void handleUnlink(link.id)}
                        >
                          Unlink
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {links.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6" colSpan={5}>
                      <EmptyState
                        title="No linked projects"
                        description="No linked projects yet."
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </NeoTable>
          </NeoPanel>
        </>
      ) : null}
    </PageLayout>
  );
}
