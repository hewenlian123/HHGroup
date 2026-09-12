"use client";

import { financeReturnLabel } from "@/lib/finance-navigation";

import "../expenses-ui-theme.css";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { ExpenseDatePicker } from "@/components/expense-date-picker";
import { ExpensePaymentMethodSelect } from "@/components/expense-payment-method-select";
import { SplitLinesEditor, type SplitLineRow } from "@/components/split-lines-editor";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/base";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  vendor_name: string | null;
  payment_method: string | null;
  reference_no: string | null;
  notes: string | null;
  total: number | null;
  status?: string;
  source_type?: string;
};

type ExpenseLineRow = {
  id: string;
  expense_id: string;
  project_id: string | null;
  category: string | null;
  cost_code: string | null;
  memo: string | null;
  description?: string | null;
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

type ExpenseDetailPayload = {
  ok: true;
  expense: ExpenseRow;
  lines: ExpenseLineRow[];
  projects: ProjectOption[];
  vendors: NameRow[];
  categories: NameRow[];
  paymentMethods: NameRow[];
  attachments: AttachmentRow[];
};

type ExpenseActionResponse = {
  ok: boolean;
  message?: string;
  line?: ExpenseLineRow;
  name?: string;
};

type AttachmentUploadResponse = {
  ok: boolean;
  message?: string;
  attachment?: AttachmentRow;
};

type SignedAttachmentFile = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
};

type SignedAttachmentsResponse = {
  ok: boolean;
  message?: string;
  files?: SignedAttachmentFile[];
};

function safeNumber(n: number | null | undefined): number {
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function toNullable(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
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

export function ExpenseDetailClient({ id, returnHref }: { id: string; returnHref: string }) {
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savedExpense, setSavedExpense] = React.useState<ExpenseRow | null>(null);
  const [discardHref, setDiscardHref] = React.useState<string | null>(null);
  const dirtyRef = React.useRef(false);
  const [expense, setExpense] = React.useState<ExpenseRow | null>(null);
  const [savedLines, setSavedLines] = React.useState<ExpenseLineRow[]>([]);
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
  const [attachmentDeleteTarget, setAttachmentDeleteTarget] = React.useState<AttachmentRow | null>(
    null
  );
  const [failedAttachmentFiles, setFailedAttachmentFiles] = React.useState<File[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = React.useState<{
    tone: "error" | "success";
    title: string;
    detail?: string;
  } | null>(null);
  const { openPreview } = useAttachmentPreview();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await readJson<ExpenseDetailPayload & { message?: string }>(response);
    if (!response.ok || !body?.ok) {
      setError(body?.message || "Failed to load expense.");
      setLoading(false);
      return;
    }

    setExpense(body.expense);
    setSavedExpense(body.expense);
    const loadedLines = (body.lines ?? []).map((line) => ({
      ...line,
      memo: line.description ?? line.memo ?? null,
    }));
    setLines(loadedLines);
    setSavedLines(loadedLines);
    setProjects(body.projects ?? []);

    setVendors(
      asNameList(
        ((body.vendors ?? []) as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );
    setCategories(
      asNameList(
        ((body.categories ?? []) as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );
    setPaymentMethods(
      asNameList(
        ((body.paymentMethods ?? []) as NameRow[]).map((r) => ({
          name: r.name,
          status: r.status,
        }))
      )
    );

    setAttachments(body.attachments ?? []);
    setLoading(false);
  }, [id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      if (!dirtyRef.current) void refresh();
    }, [refresh]),
    [refresh]
  );

  const dirty =
    JSON.stringify(expense) !== JSON.stringify(savedExpense) ||
    JSON.stringify(lines) !== JSON.stringify(savedLines);
  dirtyRef.current = dirty;
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const protectLink = (event: MouseEvent) => {
      if (
        !dirtyRef.current ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.href === window.location.href
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDiscardHref(link.href);
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const protectNavigation = (event: Event) => {
      const destination = (event as Event & { destination?: { url: string } }).destination;
      if (
        !dirtyRef.current ||
        !event.cancelable ||
        !destination ||
        destination.url === window.location.href
      )
        return;
      event.preventDefault();
      setDiscardHref(destination.url);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", protectLink, true);
    navigation?.addEventListener("navigate", protectNavigation);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", protectLink, true);
      navigation?.removeEventListener("navigate", protectNavigation);
    };
  }, [dirty]);

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

  const headerSaveInFlightRef = React.useRef(false);
  const saveHeader = React.useCallback(
    async (patch: Partial<ExpenseRow>): Promise<boolean> => {
      if (!expense || headerSaveInFlightRef.current) return false;
      headerSaveInFlightRef.current = true;
      setSaving(true);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`/api/expenses/${encodeURIComponent(expense.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(patch),
        });
        const body = await readJson<{ ok: boolean; message?: string; expense?: ExpenseRow }>(
          response
        );
        if (!response.ok || !body?.ok || !body.expense) {
          setError(body?.message || "Failed to save expense.");
          setSaving(false);
          return false;
        }
        setExpense((current) => (current === expense ? body.expense! : current));
        setSavedExpense(body.expense);
        setSaving(false);
        setMessage("Saved.");
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to save expense.");
        return false;
      } finally {
        headerSaveInFlightRef.current = false;
        setSaving(false);
      }
    },
    [expense]
  );

  const headerForSave = React.useMemo(
    () =>
      expense
        ? {
            expense_date: expense.expense_date ?? undefined,
            vendor_name: toNullable(expense.vendor_name ?? "") ?? undefined,
            payment_method: toNullable(expense.payment_method ?? "") ?? "ACH",
            reference_no: toNullable(expense.reference_no ?? "") ?? undefined,
            notes: toNullable(expense.notes ?? ""),
          }
        : null,
    [expense]
  );
  const runExpenseAction = React.useCallback(
    async (payload: Record<string, unknown>): Promise<ExpenseActionResponse | null> => {
      const response = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJson<ExpenseActionResponse>(response);
      if (!response.ok || !body?.ok) {
        setError(body?.message || "Expense action failed.");
        return null;
      }
      return body;
    },
    [id]
  );

  const upsertLine = (lineId: string, patch: Partial<SplitLineRow>) => {
    setLines((current) =>
      current.map((line) =>
        line.id !== lineId
          ? line
          : {
              ...line,
              ...(patch.projectId !== undefined ? { project_id: patch.projectId } : {}),
              ...(patch.category !== undefined ? { category: patch.category } : {}),
              ...(patch.costCode !== undefined ? { cost_code: patch.costCode } : {}),
              ...(patch.memo !== undefined ? { memo: patch.memo } : {}),
              ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
            }
      )
    );
  };

  const saveLine = async (lineId: string) => {
    const line = lines.find((item) => item.id === lineId);
    if (!line || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = await runExpenseAction({
        action: "update-line",
        lineId,
        patch: {
          projectId: line.project_id,
          category: line.category,
          costCode: line.cost_code,
          memo: line.memo,
          amount: line.amount,
        },
      });
      if (body?.line) {
        body.line = { ...body.line, memo: body.line.description ?? body.line.memo ?? null };
        setLines((current) => current.map((item) => (item.id === lineId ? body.line! : item)));
        setSavedLines((current) => current.map((item) => (item.id === lineId ? body.line! : item)));
        setMessage("Line saved.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save line.");
    } finally {
      setSaving(false);
    }
  };

  const addLine = async () => {
    const body = await runExpenseAction({ action: "add-line" });
    if (body?.line) {
      setLines((prev) => [...prev, body.line!]);
      setSavedLines((prev) => [...prev, body.line!]);
    }
  };

  const deleteLine = async (lineId: string) => {
    const body = await runExpenseAction({ action: "delete-line", lineId });
    if (body?.ok) {
      setLines((prev) => prev.filter((l) => l.id !== lineId));
      setSavedLines((prev) => prev.filter((l) => l.id !== lineId));
    }
  };

  const addVendor = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v) return "";
    const body = await runExpenseAction({ action: "add-vendor", name: v });
    if (body?.ok) {
      setVendors((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    }
    return v;
  };

  const addCategory = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v) return "";
    const body = await runExpenseAction({ action: "add-category", name: v });
    if (body?.ok) {
      setCategories((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    }
    return v;
  };

  const addPaymentMethod = async (name: string): Promise<string> => {
    const v = name.trim();
    if (!v) return "";
    const body = await runExpenseAction({ action: "add-payment-method", name: v });
    if (body?.ok) {
      setPaymentMethods((prev) => ({
        ...prev,
        options: Array.from(new Set([...prev.options, v])).sort((a, b) => a.localeCompare(b)),
      }));
    }
    return v;
  };

  const uploadAttachments = async (files: File[]) => {
    if (files.length === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setAttachmentFeedback(null);
    setFailedAttachmentFiles([]);
    let uploaded = 0;
    const failed: File[] = [];
    let firstFailure = "";
    try {
      for (const file of files) {
        try {
          const formData = new FormData();
          formData.set("file", file);
          const response = await fetch(`/api/expenses/${encodeURIComponent(id)}/attachments`, {
            method: "POST",
            body: formData,
          });
          const body = await readJson<AttachmentUploadResponse>(response);
          if (!response.ok || !body?.ok || !body.attachment) {
            throw new Error(body?.message || "Upload failed.");
          }
          setAttachments((prev) => [body.attachment!, ...prev]);
          uploaded += 1;
        } catch (uploadError) {
          failed.push(file);
          firstFailure ||=
            uploadError instanceof Error ? uploadError.message : "Receipt upload failed.";
        }
      }
    } finally {
      setSaving(false);
    }

    setFailedAttachmentFiles(failed);
    if (failed.length > 0) {
      setAttachmentFeedback({
        tone: "error",
        title:
          uploaded > 0
            ? `${uploaded} attached · ${failed.length} ${failed.length === 1 ? "file needs" : "files need"} retry`
            : "Receipt upload failed",
        detail: firstFailure || "Retry the failed files without selecting them again.",
      });
    } else {
      setAttachmentFeedback({
        tone: "success",
        title: uploaded === 1 ? "Receipt attached" : `${uploaded} receipts attached`,
        detail: "The evidence is now linked to this expense.",
      });
    }
  };

  const openAttachment = async (row: AttachmentRow) => {
    const idx = attachments.findIndex((a) => a.id === row.id);
    const response = await fetch(`/api/expenses/${encodeURIComponent(id)}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ attachmentIds: attachments.map((a) => a.id) }),
    });
    const body = await readJson<SignedAttachmentsResponse>(response);
    const signedFiles = body?.files ?? [];
    const files = attachments.map((a) => {
      const signed = signedFiles.find((file) => file.id === a.id);
      const url = signed?.url ?? "";
      const mime = (signed?.mimeType || a.mime_type || "").toLowerCase();
      const isPdf = mime === "application/pdf";
      const isImage = mime.startsWith("image/");
      return {
        url,
        fileName: signed?.fileName || a.file_name || "File",
        fileType: (isPdf ? "pdf" : "image") as "pdf" | "image",
        unsupported: Boolean(url) && !isPdf && !isImage,
      };
    });
    if (!files.some((f) => f.url)) {
      setError(body?.message || "Unable to open attachment.");
      return;
    }
    openPreview({
      files,
      initialIndex: Math.max(0, idx),
      presentation: {
        kind: "receipt",
        metadata: {
          merchant: expense?.vendor_name || "Needs review",
          expenseDate: formatDate(expense?.expense_date),
          amount: formatCurrency(safeNumber(expense?.total) || linesTotal),
          project: Array.from(
            new Set(
              lines.map((line) =>
                line.project_id == null
                  ? "Overhead"
                  : (projects.find((project) => project.id === line.project_id)?.name ??
                    line.project_id)
              )
            )
          ).join(", "),
          category: Array.from(
            new Set(lines.map((line) => line.category).filter((value): value is string => !!value))
          ).join(", "),
          paymentSource: expense?.payment_method || undefined,
        },
      },
      onClosed: () => {},
    });
  };

  const deleteAttachment = async () => {
    if (!attachmentDeleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/expenses/${encodeURIComponent(id)}/attachments?attachmentId=${encodeURIComponent(
          attachmentDeleteTarget.id
        )}`,
        { method: "DELETE", headers: { Accept: "application/json" } }
      );
      const body = await readJson<{ ok: boolean; message?: string }>(response);
      if (!response.ok || !body?.ok)
        throw new Error(body?.message || "Failed to delete attachment.");
      setAttachments((prev) => prev.filter((att) => att.id !== attachmentDeleteTarget.id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Failed to delete attachment.");
      throw e instanceof Error ? e : new Error("Failed to delete attachment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="financial-nums expenses-ui min-h-full px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-[var(--hh-text-secondary)] md:px-8 md:py-8">
      <div className="page-shell-wide mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={returnHref}
            onClick={(event) => {
              if (dirty) {
                event.preventDefault();
                setDiscardHref(returnHref);
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-[var(--hh-text-secondary)] outline-none hover:text-[var(--hh-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] md:min-h-9"
          >
            <ArrowLeft className="h-4 w-4" />
            {financeReturnLabel(returnHref)}
          </Link>
          <Button
            variant="outline"
            onClick={() => syncRouterNonBlocking(router)}
            disabled={saving || dirty}
          >
            Refresh
          </Button>
        </div>

        {expense &&
          (expense.status === "draft" ||
            expense.status === "needs_review" ||
            expense.status === "pending") && (
            <Button asChild variant="outline" disabled={dirty || saving}>
              <Link
                href={`/financial/inbox?ops_record=${encodeURIComponent(id)}`}
                onClick={(event) => {
                  if (dirty || saving) event.preventDefault();
                }}
              >
                Review and approve
              </Link>
            </Button>
          )}
        {dirty && (
          <p role="status">Unsaved changes. Save details and each edited line before leaving.</p>
        )}
        {error ? (
          <div
            role="alert"
            className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-4 py-3 text-sm text-[var(--hh-danger)]"
          >
            {error}
          </div>
        ) : null}
        {message ? (
          <div
            role="status"
            className="rounded-hh-standard border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] px-4 py-3 text-sm text-[var(--hh-success)]"
          >
            {message}
          </div>
        ) : null}

        <Card className="rounded-xl border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 shadow-operational md:p-5">
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
                    contentClassName="expenses-ui-dialog"
                    selectedOptionClassName="bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
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
                    <span className="mt-1 inline-block text-xs text-[var(--hh-warning)]">
                      Disabled
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-normal">
                    Date
                  </p>
                  <ExpenseDatePicker
                    id="expense-detail-date"
                    value={expense.expense_date ?? hawaiiTodayYmd()}
                    onChange={(nextDate) =>
                      setExpense((prev) => (prev ? { ...prev, expense_date: nextDate } : prev))
                    }
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-normal">
                    Payment method
                  </p>
                  <ExpensePaymentMethodSelect
                    id="expense-detail-payment-method-select"
                    value={expense.payment_method ?? "ACH"}
                    onValueChange={(v) =>
                      setExpense((prev) => (prev ? { ...prev, payment_method: v } : prev))
                    }
                    className="mt-1"
                  />
                  {expense.payment_method && paymentMethods.disabled.has(expense.payment_method) ? (
                    <span className="mt-1 inline-block text-xs text-[var(--hh-warning)]">
                      Disabled
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-normal">
                    Reference #
                  </p>
                  <Input
                    value={expense.reference_no ?? ""}
                    onChange={(e) =>
                      setExpense((prev) =>
                        prev ? { ...prev, reference_no: e.target.value } : prev
                      )
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-normal">
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
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <SubmitSpinner loading={saving} className="shrink-0" />
                {saving ? "Saving…" : message === "Saved." ? "Saved" : null}
                <Button
                  type="button"
                  size="sm"
                  className="rounded-sm"
                  disabled={saving || !headerForSave}
                  onClick={() => {
                    if (!headerForSave) return;
                    void saveHeader({
                      expense_date: headerForSave.expense_date,
                      vendor_name: headerForSave.vendor_name ?? undefined,
                      payment_method: headerForSave.payment_method,
                      reference_no: headerForSave.reference_no ?? undefined,
                      notes: headerForSave.notes,
                    });
                  }}
                >
                  Save details
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card
          data-expense-detail-attachments
          className="rounded-xl border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 shadow-operational md:p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Receipt attachments</p>
              <p className="text-xs text-muted-foreground">
                Evidence linked to this expense · Photos and PDFs
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  void uploadAttachments(files);
                  event.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  void uploadAttachments(files);
                  event.target.value = "";
                }}
              />
              <Button
                variant="outline"
                className="h-11 touch-manipulation md:hidden"
                onClick={() => cameraInputRef.current?.click()}
                disabled={saving}
              >
                <Camera className="h-4 w-4" aria-hidden />
                Take photo
              </Button>
              <Button
                variant="outline"
                className="h-11 touch-manipulation md:h-9"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Upload className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Upload files</span>
                <span className="sm:hidden">Upload</span>
              </Button>
            </div>
          </div>

          {attachmentFeedback ? (
            <div
              role={attachmentFeedback.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className={cn(
                "mt-3 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5",
                attachmentFeedback.tone === "error"
                  ? "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]"
                  : "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold">{attachmentFeedback.title}</p>
                {attachmentFeedback.detail ? (
                  <p className="mt-0.5 text-hh-status leading-snug opacity-85">
                    {attachmentFeedback.detail}
                  </p>
                ) : null}
              </div>
              {failedAttachmentFiles.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 touch-manipulation"
                  disabled={saving}
                  onClick={() => void uploadAttachments(failedAttachmentFiles)}
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : attachments.length === 0 ? (
              <button
                type="button"
                className="flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l3-hover)] px-4 py-4 text-center outline-none hover:bg-[var(--hh-l2-operational-surface)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-5 w-5 text-[var(--hh-text-secondary)]" aria-hidden />
                <span className="mt-2 text-sm font-medium text-[var(--hh-text-primary)]">
                  No receipt attached
                </span>
                <span className="mt-0.5 text-xs text-[var(--hh-text-secondary)]">
                  Add a photo or PDF as expense evidence
                </span>
              </button>
            ) : (
              attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex min-h-14 items-center gap-3 border-b border-[var(--hh-border)] px-1 py-2.5 last:border-b-0"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => void openAttachment(att)}
                  >
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {att.file_name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {(att.size_bytes ?? 0) > 1024
                          ? `${((att.size_bytes ?? 0) / 1024).toFixed(1)} KB`
                          : `${att.size_bytes ?? 0} B`}
                      </p>
                    </div>
                  </button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="btn-outline-ghost h-11 w-11 touch-manipulation md:h-9 md:w-9"
                    onClick={() => void openAttachment(att)}
                    aria-label="Preview receipt"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="btn-outline-ghost h-11 w-11 touch-manipulation text-destructive md:h-9 md:w-9"
                    onClick={() => setAttachmentDeleteTarget(att)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-xl border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-4 shadow-operational md:p-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <fieldset disabled={saving}>
              <SplitLinesEditor
                overlayClassName="expenses-ui-dialog"
                lines={splitLinesForEditor}
                onLineChange={upsertLine}
                onSaveLine={(lineId) => void saveLine(lineId)}
                isLineDirty={(lineId) =>
                  JSON.stringify(lines.find((line) => line.id === lineId)) !==
                  JSON.stringify(savedLines.find((line) => line.id === lineId))
                }
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
            </fieldset>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] p-4">
              <p className="text-hh-status uppercase tracking-normal text-muted-foreground">
                Lines total
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--hh-danger)]">
                {formatCurrency(-linesTotal)}
              </p>
            </div>
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] p-4">
              <p className="text-hh-status uppercase tracking-normal text-muted-foreground">
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
                    <span className="text-foreground">{formatCurrency(-amount)}</span>
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
      <ConfirmDialog
        open={discardHref !== null}
        onOpenChange={(open) => {
          if (!open) setDiscardHref(null);
        }}
        title="Discard unsaved changes?"
        description="Your saved expense will stay unchanged."
        confirmLabel="Discard changes"
        onConfirm={() => {
          dirtyRef.current = false;
          if (discardHref) router.push(discardHref);
        }}
      />
      <ConfirmDialog
        open={!!attachmentDeleteTarget}
        onOpenChange={(open) => {
          if (!open) setAttachmentDeleteTarget(null);
        }}
        title="Delete attachment?"
        description={`Delete ${attachmentDeleteTarget?.file_name ?? "this attachment"}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={deleteAttachment}
      />
    </div>
  );
}
