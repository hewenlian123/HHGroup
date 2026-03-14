"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";

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
  projects?: Array<{ id: string; name: string | null }> | { id: string; name: string | null } | null;
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

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
          .select("id,project_id,subcontractor_id,role,agreed_rate_type,agreed_rate,projects(id,name)")
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
      const { error } = await supabase.from("project_subcontractors").upsert([payload], { onConflict: "project_id,subcontractor_id" });
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
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, file, {
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
      const { data, error } = await supabase.storage.from("attachments").createSignedUrl(filePath, 60);
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
        const { error: storageError } = await supabase.storage.from("attachments").remove([attachment.file_path]);
        if (storageError) throw storageError;
        const { error: dbError } = await supabase.from("attachments").delete().eq("id", attachment.id);
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
    return <div className="page-container page-stack py-6 text-sm text-muted-foreground">Loading subcontractor...</div>;
  }

  if (notFound || !row) {
    return (
      <div className="page-container page-stack py-6">
        <PageHeader title="Subcontractor not found" subtitle="The selected subcontractor does not exist." />
        <Button asChild variant="outline" className="w-fit">
          <Link href="/labor/subcontractors">Back to Subcontractors</Link>
        </Button>
      </div>
    );
  }

  const insuranceExpired = row.insurance_expiration ? new Date(row.insurance_expiration).getTime() < Date.now() : false;

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title={row.display_name}
        subtitle="Subcontractor profile, compliance docs, and linked projects."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/labor/subcontractors">Back</Link>
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={tab === "profile" ? "default" : "outline"} size="sm" onClick={() => setTab("profile")}>
          Profile
        </Button>
        <Button variant={tab === "docs" ? "default" : "outline"} size="sm" onClick={() => setTab("docs")}>
          Docs / Attachments
        </Button>
        <Button variant={tab === "projects" ? "default" : "outline"} size="sm" onClick={() => setTab("projects")}>
          Linked Projects
        </Button>
      </div>

      {tab === "profile" ? (
        <Card className="rounded-2xl border border-zinc-200/60 p-4 dark:border-border">
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge status={row.status} />
            <span className="text-xs text-muted-foreground">
              W9: {row.w9_on_file ? "On file" : "Missing"} · Insurance: {row.insurance_expiration ?? "N/A"}
              {insuranceExpired ? " (Expired)" : ""}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Display Name</p>
              <Input value={row.display_name} onChange={(event) => setRow((prev) => (prev ? { ...prev, display_name: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Legal Name</p>
              <Input value={row.legal_name ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, legal_name: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Contact Name</p>
              <Input value={row.contact_name ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, contact_name: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input value={row.phone ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, phone: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <Input value={row.email ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, email: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <select
                value={row.status}
                onChange={(event) =>
                  setRow((prev) => (prev ? { ...prev, status: event.target.value === "inactive" ? "inactive" : "active" } : prev))
                }
                className="h-10 w-full rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">W9 on file</p>
              <label className="inline-flex items-center gap-2 rounded-[10px] border border-input bg-muted/20 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.w9_on_file}
                  onChange={(event) => setRow((prev) => (prev ? { ...prev, w9_on_file: event.target.checked } : prev))}
                />
                Yes
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Insurance Expiration</p>
              <Input
                type="date"
                value={row.insurance_expiration ?? ""}
                onChange={(event) => setRow((prev) => (prev ? { ...prev, insurance_expiration: event.target.value || null } : prev))}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">License Number</p>
              <Input value={row.license_number ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, license_number: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tax ID Last 4</p>
              <Input value={row.tax_id_last4 ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, tax_id_last4: event.target.value } : prev))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address Line 1</p>
              <Input value={row.address1 ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, address1: event.target.value } : prev))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address Line 2</p>
              <Input value={row.address2 ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, address2: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">City</p>
              <Input value={row.city ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, city: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">State</p>
              <Input value={row.state ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, state: event.target.value } : prev))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">ZIP</p>
              <Input value={row.zip ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, zip: event.target.value } : prev))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input value={row.notes ?? ""} onChange={(event) => setRow((prev) => (prev ? { ...prev, notes: event.target.value } : prev))} />
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "docs" ? (
        <Card className="rounded-2xl border border-zinc-200/60 p-4 dark:border-border">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
                event.currentTarget.value = "";
              }}
              disabled={uploading}
              className="max-w-[360px]"
            />
            <span className="text-xs text-muted-foreground">{uploading ? "Uploading..." : "Upload W9 / COI / contract PDF."}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 bg-muted/30 dark:border-border/60">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">File</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Size</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="px-4 py-3 text-foreground">{item.file_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.mime_type || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.size_bytes != null ? `${Math.round(item.size_bytes / 1024)} KB` : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleOpenAttachment(item.file_path)}>
                          Open
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleDeleteAttachment(item)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {attachments.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      No attachments yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "projects" ? (
        <Card className="rounded-2xl border border-zinc-200/60 p-4 dark:border-border">
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <select
              value={linkProjectId}
              onChange={(event) => setLinkProjectId(event.target.value)}
              className="h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
            >
              <option value="">Select project</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || project.id}
                </option>
              ))}
            </select>
            <Input value={linkRole} onChange={(event) => setLinkRole(event.target.value)} placeholder="Role (e.g. roofing)" />
            <select
              value={linkRateType}
              onChange={(event) => setLinkRateType(event.target.value)}
              className="h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
            >
              <option value="">Rate type</option>
              <option value="fixed">fixed</option>
              <option value="t&m">t&m</option>
              <option value="unit">unit</option>
            </select>
            <Input value={linkRate} onChange={(event) => setLinkRate(event.target.value)} type="number" min="0" step="0.01" placeholder="Rate" />
          </div>
          <div className="mb-4">
            <Button onClick={() => void handleLinkProject()} disabled={linking || !linkProjectId}>
              {linking ? "Linking..." : "Link to Project"}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 bg-muted/30 dark:border-border/60">
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">Rate type</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">Rate</th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="px-4 py-3 text-foreground">{link.projects?.name || link.project_id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{link.role || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{link.agreed_rate_type || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {link.agreed_rate != null ? `$${Number(link.agreed_rate).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => void handleUnlink(link.id)}>
                        Unlink
                      </Button>
                    </td>
                  </tr>
                ))}
                {links.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      No linked projects yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
