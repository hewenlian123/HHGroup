"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { SplitLinesEditor, type SplitLineRow } from "@/components/split-lines-editor";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { createBrowserClient } from "@/lib/supabase";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useOnAppSync } from "@/hooks/use-on-app-sync";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  vendor_name: string | null;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  total: number | null;
};

type ExpenseLineRow = {
  id: string;
  expense_id: string;
  project_id: string | null;
  category: string | null;
  cost_code: string | null;
  memo: string | null;
  amount: number | null;
};

type ProjectOption = { id: string; name: string | null };
type NameRow = { id: string; name: string; status?: string | null };
type AttachmentRow = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function toNullable(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function asNameList(rows: Array<{ name: string; status?: string | null }>): {
  options: string[];
  disabled: Set<string>;
} {
  const disabled = new Set<string>();
  const names = rows
    .map((r) => {
      if ((r.status ?? "active") === "inactive") disabled.add(r.name);
      return r.name;
    })
    .filter(Boolean);
  return { options: Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)), disabled };
}

export function ExpenseDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expense, setExpense] = React.useState<ExpenseRow | null>(null);
  const [lines, setLines] = React.useState<ExpenseLineRow[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [categories, setCategories] = React.useState<{ options: string[]; disabled: Set<string> }>({
    options: [],
    disabled: new Set(),
  });
  const [vendors, setVendors] = React.useState<{ options: string[]; disabled: Set<string> }>({
    options: [],
    disabled: new Set(),
  });
  const [paymentMethods, setPaymentMethods] = React.useState<{
    options: string[];
    disabled: Set<string>;
  }>({ options: [], disabled: new Set() });
  const [attachments, setAttachments] = React.useState<AttachmentRow[]>([]);
  const { openPreview } = useAttachmentPreview();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    const [expRes, linesRes, projectRes, vendorsRes, categoriesRes, pmRes, attachmentsRes] =
      await Promise.all([
        supabase.from("expenses").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("expense_lines")
          .select("*")
          .eq("expense_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("projects")
          .select("id,name")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("vendors")
          .select("id,name,status")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("categories")
          .select("id,name,status")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("payment_methods")
          .select("id,name,status")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("attachments")
          .select("*")
          .eq("entity_type", "expense")
          .eq("entity_id", id)
          .order("created_at", { ascending: false }),
      ]);

    if (expRes.error) {
      setError(expRes.error.message || "Failed to load expense.");
      setLoading(false);
      return;
    }
    if (!expRes.data) {
      setError("Expense not found.");
      setLoading(false);
      return;
    }

    setExpense(expRes.data as ExpenseRow);
    setLines((linesRes.data ?? []) as ExpenseLineRow[]);
    setProjects((projectRes.data ?? []) as ProjectOption[]);

    setVendors(
      asNameList(
        ((vendorsRes.data ?? []) as unknown as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );
    setCategories(
      asNameList(
        ((categoriesRes.data ?? []) as unknown as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );
    setPaymentMethods(
      asNameList(
        ((pmRes.data ?? []) as unknown as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );

    setAttachments((attachmentsRes.data ?? []) as AttachmentRow[]);
    setLoading(false);
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

  const linesTotal = React.useMemo(() => {
    return lines.reduce((s, l) => s + safeNumber(l.amount), 0);
  }, [lines]);

  const byProject = React.useMemo(() => {
    const map = new Map<string | null, number>();
    for (const l of lines) {
      const key = l.project_id ?? null;
      map.set(key, (map.get(key) ?? 0) + safeNumber(l.amount));
    }
    return map;
  }, [lines]);

  const splitLinesForEditor: SplitLineRow[] = React.useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        projectId: l.project_id,
        category: l.category ?? "Other",
        costCode: l.cost_code,
        memo: l.memo,
        amount: safeNumber(l.amount),
      })),
    [lines]
  );

  const saveHeader = React.useCallback(
    async (patch: Partial<ExpenseRow>): Promise<boolean> => {
      if (!supabase || !expense) return false;
      setSaving(true);
      setError(null);
      setMessage(null);
      const { error: upError } = await supabase.from("expenses").update(patch).eq("id", expense.id);
      if (upError) {
        setError(upError.message || "Failed to save expense.");
        setSaving(false);
        return false;
      }
      setExpense((prev) => (prev ? { ...prev, ...patch } : prev));
      setSaving(false);
      setMessage("Saved.");
      return true;
    },
    [expense, supabase]
  );

  const headerForSave = expense
    ? {
        expense_date: expense.expense_date ?? undefined,
        vendor_name: toNullable(expense.vendor_name ?? "") ?? undefined,
        payment_method: toNullable(expense.payment_method ?? "") ?? "ACH",
        reference_no: toNullable(expense.reference_no ?? "") ?? undefined,
        notes: toNullable(expense.notes ?? "") ?? undefined,
      }
    : null;
  const debouncedHeader = useDebouncedValue(headerForSave, 800);
  const lastSavedHeaderRef = React.useRef<typeof headerForSave>(null);
  const initialLoadDoneRef = React.useRef(false);

  React.useEffect(() => {
    if (!expense || !supabase || !debouncedHeader) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      lastSavedHeaderRef.current = debouncedHeader;
      return;
    }
    const prev = lastSavedHeaderRef.current;
    if (
      prev &&
      prev.expense_date === debouncedHeader.expense_date &&
      prev.vendor_name === debouncedHeader.vendor_name &&
      prev.payment_method === debouncedHeader.payment_method &&
      prev.reference_no === debouncedHeader.reference_no &&
      prev.notes === debouncedHeader.notes
    )
      return;
    void saveHeader({
      expense_date: debouncedHeader.expense_date,
      vendor_name: debouncedHeader.vendor_name ?? undefined,
      payment_method: debouncedHeader.payment_method,
      reference_no: debouncedHeader.reference_no ?? undefined,
      notes: debouncedHeader.notes ?? undefined,
    }).then((ok) => {
      if (ok) lastSavedHeaderRef.current = debouncedHeader;
    });
  }, [debouncedHeader, expense, saveHeader, supabase]);

  const upsertLine = async (lineId: string, patch: Partial<SplitLineRow>) => {
    if (!supabase) return;
    const existing = lines.find((l) => l.id === lineId);
    if (!existing) return;
    const payload: Partial<ExpenseLineRow> = {
      project_id: patch.projectId !== undefined ? patch.projectId : existing.project_id,
      category: patch.category !== undefined ? patch.category : existing.category,
      cost_code: patch.costCode !== undefined ? (patch.costCode ?? null) : existing.cost_code,
      memo: patch.memo !== undefined ? (patch.memo ?? null) : existing.memo,
      amount: patch.amount !== undefined ? patch.amount : existing.amount,
    };
    const { error: upError } = await supabase
      .from("expense_lines")
      .update(payload)
      .eq("id", lineId);
    if (upError) {
      setError(upError.message || "Failed to update line.");
      return;
    }
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...payload } : l)));
  };

  const addLine = async () => {
    if (!supabase) return;
    const { data: inserted, error: insError } = await supabase
      .from("expense_lines")
      .insert([{ expense_id: id, project_id: null, category: "Other", amount: 0 }])
      .select("id, expense_id, project_id, category, cost_code, memo, amount")
      .single();
    if (insError) {
      setError(insError.message || "Failed to add line.");
      return;
    }
    setLines((prev) => [...prev, inserted as ExpenseLineRow]);
  };

  const deleteLine = async (lineId: string) => {
    if (!supabase) return;
    const { error: delError } = await supabase.from("expense_lines").delete().eq("id", lineId);
    if (delError) {
      setError(delError.message || "Failed to delete line.");
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const addVendor = async (name: string): Promise<string> => {
    if (!supabase) return "";
    const v = name.trim();
    if (!v) return "";
    const { error: insError } = await supabase
      .from("vendors")
      .insert([{ name: v, status: "active" }]);
    if (insError) setError(insError.message || "Failed to add vendor.");
    else
      setVendors((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    return v;
  };

  const addCategory = async (name: string): Promise<string> => {
    if (!supabase) return "";
    const v = name.trim();
    if (!v) return "";
    const { error: insError } = await supabase
      .from("categories")
      .insert([{ name: v, type: "expense", status: "active" }]);
    if (insError) setError(insError.message || "Failed to add category.");
    else
      setCategories((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    return v;
  };

  const addPaymentMethod = async (name: string): Promise<string> => {
    if (!supabase) return "";
    const v = name.trim();
    if (!v) return "";
    const { error: insError } = await supabase
      .from("payment_methods")
      .insert([{ name: v, status: "active" }]);
    if (insError) setError(insError.message || "Failed to add payment method.");
    else
      setPaymentMethods((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    return v;
  };

  const uploadAttachment = async (file: File) => {
    if (!supabase) return;
    // Debug: expense receipt upload start
    // eslint-disable-next-line no-console
    console.log("[ExpenseDetail] uploadAttachment start", {
      expenseId: id,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `attachments/expenses/${id}/${Date.now()}-${safeName}`;
      const uploadRes = await supabase.storage.from("attachments").upload(filePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadRes.error) throw uploadRes.error;
      // Debug: storage upload success
      // eslint-disable-next-line no-console
      console.log("[ExpenseDetail] storage upload success", {
        expenseId: id,
        filePath,
        bucket: "attachments",
      });
      const insertRes = await supabase.from("attachments").insert([
        {
          entity_type: "expense",
          entity_id: id,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        },
      ]);
      if (insertRes.error) throw insertRes.error;
      await refresh();
      setMessage("Attachment uploaded.");
      // Debug: attachment row insert + refresh success
      // eslint-disable-next-line no-console
      console.log("[ExpenseDetail] attachment insert success", { expenseId: id, filePath });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Upload failed.");
      // Debug: upload error
      // eslint-disable-next-line no-console
      console.error("[ExpenseDetail] uploadAttachment error", e);
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async (row: AttachmentRow) => {
    if (!supabase) return;
    const idx = attachments.findIndex((a) => a.id === row.id);
    const signed = await Promise.all(
      attachments.map((a) => supabase.storage.from("attachments").createSignedUrl(a.file_path, 60))
    );
    const files = attachments.map((a, i) => {
      const url = signed[i].data?.signedUrl ?? "";
      const mime = (a.mime_type ?? "").toLowerCase();
      const isPdf = mime === "application/pdf";
      const isImage = mime.startsWith("image/");
      return {
        url,
        fileName: a.file_name ?? "File",
        fileType: (isPdf ? "pdf" : "image") as "pdf" | "image",
        unsupported: Boolean(url) && !isPdf && !isImage,
      };
    });
    if (!files.some((f) => f.url)) {
      setError(signed[0]?.error?.message || "Unable to open attachment.");
      return;
    }
    openPreview({
      files,
      initialIndex: Math.max(0, idx),
      onClosed: () => {},
    });
  };

  const deleteAttachment = async (row: AttachmentRow) => {
    if (!supabase) return;
    if (!window.confirm("Delete attachment?")) return;
    setSaving(true);
    setError(null);
    try {
      const [storageRes, dbRes] = await Promise.all([
        supabase.storage.from("attachments").remove([row.file_path]),
        supabase.from("attachments").delete().eq("id", row.id),
      ]);
      if (storageRes.error) throw storageRes.error;
      if (dbRes.error) throw dbRes.error;
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to delete attachment.");
    } finally {
      setSaving(false);
    }
  };

  if (!configured) {
    return (
      <div className="page-container page-stack">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container page-stack">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/financial/expenses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Expenses
        </Link>
        <Button
          variant="outline"
          onClick={() => void syncRouterAndClients(router)}
          disabled={saving}
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-[12px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-muted-foreground">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-[12px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#166534]">
          {message}
        </div>
      ) : null}

      <Card className="p-5">
        {loading || !expense ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <CreatableSelect
                  label="Vendor"
                  value={expense.vendor_name ?? ""}
                  options={vendors.options}
                  placeholder="Vendor name"
                  onChange={(v) =>
                    setExpense((prev) => (prev ? { ...prev, vendor_name: v } : prev))
                  }
                  onCreate={async (name) => {
                    const v = await addVendor(name);
                    if (v) setExpense((prev) => (prev ? { ...prev, vendor_name: v } : prev));
                  }}
                />
                {expense.vendor_name && vendors.disabled.has(expense.vendor_name) ? (
                  <span className="mt-1 inline-block text-xs text-amber-600">Disabled</span>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </p>
                <Input
                  type="date"
                  value={expense.expense_date ?? new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setExpense((prev) => (prev ? { ...prev, expense_date: e.target.value } : prev))
                  }
                />
              </div>
              <div>
                <CreatableSelect
                  label="Payment method"
                  value={expense.payment_method ?? "ACH"}
                  options={paymentMethods.options}
                  placeholder="Payment method"
                  onChange={(v) =>
                    setExpense((prev) => (prev ? { ...prev, payment_method: v } : prev))
                  }
                  onCreate={async (name) => {
                    const v = await addPaymentMethod(name);
                    if (v) setExpense((prev) => (prev ? { ...prev, payment_method: v } : prev));
                  }}
                />
                {expense.payment_method && paymentMethods.disabled.has(expense.payment_method) ? (
                  <span className="mt-1 inline-block text-xs text-amber-600">Disabled</span>
                ) : null}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Reference #
                </p>
                <Input
                  value={expense.reference_no ?? ""}
                  onChange={(e) =>
                    setExpense((prev) => (prev ? { ...prev, reference_no: e.target.value } : prev))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes
              </p>
              <Input
                value={expense.notes ?? ""}
                onChange={(e) =>
                  setExpense((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                }
                placeholder="Optional"
              />
            </div>
            <div className="flex justify-end text-xs text-muted-foreground">
              {saving ? "Saving…" : message === "Saved." ? "Saved" : null}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Receipt attachments</p>
            <p className="text-xs text-muted-foreground">
              Stored in Supabase Storage bucket: attachments
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAttachment(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Plus className="h-4 w-4" />
              Add receipt
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 rounded-[12px] border border-[#E5E7EB] bg-white px-4 py-3"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => void openAttachment(att)}
                >
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{att.file_name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {(att.size_bytes ?? 0) > 1024
                        ? `${((att.size_bytes ?? 0) / 1024).toFixed(1)} KB`
                        : `${att.size_bytes ?? 0} B`}
                    </p>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => void openAttachment(att)}
                  aria-label="Open"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => void deleteAttachment(att)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-5">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <SplitLinesEditor
            lines={splitLinesForEditor}
            onLineChange={(lineId, patch) => void upsertLine(lineId, patch)}
            onAddLine={() => void addLine()}
            onDeleteLine={(lineId) => void deleteLine(lineId)}
            showCostCode
            projects={projects.map((p) => ({ id: p.id, name: p.name ?? p.id }))}
            categories={categories.options.length ? categories.options : ["Other"]}
            vendorsList={vendors.options}
            paymentMethodsList={paymentMethods.options}
            onAddCategory={(name) => {
              void addCategory(name);
              return name;
            }}
            onAddVendor={(name) => {
              void addVendor(name);
              return name;
            }}
            onAddPaymentMethod={(name) => {
              void addPaymentMethod(name);
              return name;
            }}
            onToast={(msg) => setMessage(msg)}
            isExpenseCategoryDisabled={(name) => categories.disabled.has(name)}
            isVendorDisabled={(name) => vendors.disabled.has(name)}
            isPaymentMethodDisabled={(name) => paymentMethods.disabled.has(name)}
            minLines={1}
          />
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[12px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Lines total
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-red-600">
              −{money(linesTotal)}
            </p>
          </div>
          <div className="rounded-[12px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Per project
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {Array.from(byProject.entries()).map(([projectId, amount]) => (
                <li
                  key={projectId ?? "overhead"}
                  className="flex items-center justify-between tabular-nums"
                >
                  <span className="text-muted-foreground">
                    {projectId == null
                      ? "Overhead"
                      : (projects.find((p) => p.id === projectId)?.name ?? projectId)}
                  </span>
                  <span className="text-foreground">−{money(amount)}</span>
                </li>
              ))}
              {byProject.size === 0 ? (
                <li className="text-sm text-muted-foreground">No data yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
