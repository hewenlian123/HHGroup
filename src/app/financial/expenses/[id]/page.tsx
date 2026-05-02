"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getExpenseById,
  getProjects,
  getExpenseCategories,
  getVendors,
  getAccounts,
  addExpenseCategory,
  addVendor,
  isVendorDisabled,
  getExpenseTotal,
  updateExpense,
  addExpenseLine,
  updateExpenseLine,
  updateExpenseForReview,
  deleteExpenseLine,
  addExpenseAttachment,
  deleteExpenseAttachment,
  type Expense,
  type ExpenseAttachment,
  type ExpenseLine,
  type PaymentAccountRow,
} from "@/lib/data";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import {
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { SplitLinesEditor } from "@/components/split-lines-editor";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { ArrowLeft, Plus, FileText, Download, Trash2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import { useToast } from "@/components/toast/toast-provider";
import { InlineLoading } from "@/components/ui/skeleton";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useBreadcrumbEntityLabel } from "@/contexts/breadcrumb-override-context";
import {
  deriveExpenseWorkflowStatus,
  EXPENSE_ACCOUNT_SELECT_NONE,
} from "@/lib/expense-workflow-status";

function useAsyncDisabled(name: string | null, fn: (n: string) => Promise<boolean>): boolean {
  const [disabled, setDisabled] = React.useState(false);
  React.useEffect(() => {
    if (!name) {
      setDisabled(false);
      return;
    }
    let cancelled = false;
    fn(name).then((b) => {
      if (!cancelled) setDisabled(b);
    });
    return () => {
      cancelled = true;
    };
  }, [name, fn]);
  return disabled;
}

function attachmentIsImage(att: ExpenseAttachment): boolean {
  if (att.mimeType.startsWith("image/")) return true;
  return (
    /\.(jpe?g|png|gif|webp)$/i.test(att.fileName) || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(att.url)
  );
}

function receiptHrefLooksImage(href: string): boolean {
  return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(href);
}

function receiptHrefLooksPdf(href: string): boolean {
  return /\.pdf(\?|#|$)/i.test(href);
}

function makeAttachment(file: File): ExpenseAttachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    // url stores the Storage path in DB; preview/download use signed URLs.
    url: "",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export default function ExpenseDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [expense, setExpense] = React.useState<Expense | null>(null);
  const [notFoundState, setNotFoundState] = React.useState(false);
  const [vendorName, setVendorName] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = React.useState(false);
  const { openPreview } = useAttachmentPreview();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [vendorsList, setVendorsList] = React.useState<string[]>([]);
  const [accounts, setAccounts] = React.useState<
    Array<{ id: string; name: string; lastFour: string | null }>
  >([]);
  const { toast } = useToast();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const vendorDisabled = useAsyncDisabled(vendorName || null, isVendorDisabled);

  const handlePaymentAccountsUpdated = React.useCallback((rows: PaymentAccountRow[]) => {
    void rows;
  }, []);

  React.useEffect(() => {
    if (!id) {
      setNotFoundState(true);
      return;
    }
    let cancelled = false;
    getExpenseById(id).then((e) => {
      if (cancelled) return;
      if (!e) setNotFoundState(true);
      else {
        setExpense(e);
        setVendorName(e.vendorName);
        setAccountId(e.accountId ?? "");
        setPaymentAccountId(e.paymentAccountId ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getProjects(), getExpenseCategories(), getVendors(), getAccounts()]).then(
      ([p, c, v, accs]) => {
        if (!cancelled) {
          setProjects(p);
          setCategories(c);
          setVendorsList(v);
          setAccounts(accs);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const e = await getExpenseById(id);
    if (e) {
      setExpense(e);
      setPaymentAccountId(e.paymentAccountId ?? "");
    }
  }, [id]);

  const syncWorkflowStatusFromFirstLine = React.useCallback(async () => {
    if (!id) return;
    const fresh = await getExpenseById(id);
    const first = fresh?.lines[0];
    if (!fresh || !first) return;
    await updateExpenseForReview(fresh.id, {
      status: deriveExpenseWorkflowStatus(first.projectId, first.category),
    });
  }, [id]);

  const reloadLookups = React.useCallback(async () => {
    const [p, c, v, accs] = await Promise.all([
      getProjects(),
      getExpenseCategories(),
      getVendors(),
      getAccounts(),
    ]);
    setProjects(p);
    setCategories(c);
    setVendorsList(v);
    setAccounts(accs);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void reloadLookups();
    }, [refresh, reloadLookups]),
    [refresh, reloadLookups]
  );

  useBreadcrumbEntityLabel(vendorName.trim() || expense?.vendorName?.trim() || null);

  const [attachmentPreviewSrc, setAttachmentPreviewSrc] = React.useState<
    Record<string, string | undefined>
  >({});

  const attachmentRowKey = React.useMemo(
    () =>
      expense ? expense.attachments.map((a) => `${a.id}:${a.url}:${a.mimeType}`).join("|") : "",
    [expense]
  );

  React.useEffect(() => {
    if (!expense || !supabase) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string | undefined> = {};
      for (const att of expense.attachments) {
        if (!attachmentIsImage(att)) continue;
        const { data, error } = await supabase.storage
          .from("expense-attachments")
          .createSignedUrl(att.url, 60 * 60);
        if (!error && data?.signedUrl) next[att.id] = data.signedUrl;
      }
      if (!cancelled) setAttachmentPreviewSrc(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [expense?.id, attachmentRowKey, supabase]);

  const firstImageAttachment = React.useMemo(
    () => expense?.attachments.find((a) => attachmentIsImage(a)),
    [expense?.attachments]
  );
  const firstImageSigned =
    firstImageAttachment != null ? attachmentPreviewSrc[firstImageAttachment.id] : undefined;

  const [receiptSignedUrl, setReceiptSignedUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const raw = (expense?.receiptUrl ?? "").trim();
    if (!raw) {
      setReceiptSignedUrl(null);
      return;
    }
    if (!supabase) {
      setReceiptSignedUrl(raw);
      return;
    }
    void (async () => {
      const signed = await resolvePreviewSignedUrl({
        supabase,
        rawUrlOrPath: raw,
        ttlSec: 3600,
        bucketCandidates: ["receipts", "expense-attachments"],
      });
      if (!cancelled) setReceiptSignedUrl(signed || raw);
    })();
    return () => {
      cancelled = true;
    };
  }, [expense?.receiptUrl, supabase]);

  const openPrimaryReceiptPreview = React.useCallback(() => {
    if (!expense) return;
    if (expense.receiptUrl) {
      const u = receiptSignedUrl || expense.receiptUrl;
      openPreview({
        files: [
          {
            url: u,
            fileName: "Receipt",
            fileType: (receiptHrefLooksPdf(u) ? "pdf" : "image") as "pdf" | "image",
          },
        ],
        initialIndex: 0,
        onClosed: () => {},
      });
      return;
    }
    if (firstImageAttachment && firstImageSigned) {
      openPreview({
        files: [
          {
            url: firstImageSigned,
            fileName: firstImageAttachment.fileName,
            fileType: "image" as const,
          },
        ],
        initialIndex: 0,
        onClosed: () => {},
      });
    }
  }, [expense, receiptSignedUrl, firstImageAttachment, firstImageSigned, openPreview]);

  const openReceiptInNewTab = React.useCallback(() => {
    const raw = (expense?.receiptUrl ?? "").trim();
    if (!raw) return;
    const u = receiptSignedUrl || raw;
    window.open(u, "_blank", "noopener,noreferrer");
  }, [expense?.receiptUrl, receiptSignedUrl]);

  const openAttachmentCarouselAt = React.useCallback(
    async (focusIndex: number) => {
      if (!supabase || !expense) return;
      const atts = expense.attachments;
      if (atts.length === 0) return;
      const files = await Promise.all(
        atts.map(async (att) => {
          const cached = attachmentPreviewSrc[att.id];
          let url = cached ?? "";
          if (!url) {
            const { data, error } = await supabase.storage
              .from("expense-attachments")
              .createSignedUrl(att.url, 60);
            if (error || !data?.signedUrl) url = "";
            else url = data.signedUrl;
          }
          const fileType = (
            att.mimeType === "application/pdf" || receiptHrefLooksPdf(att.fileName)
              ? "pdf"
              : "image"
          ) as "pdf" | "image";
          return {
            url,
            fileName: att.fileName,
            fileType,
          };
        })
      );
      if (!files.some((f) => f.url)) {
        toast({
          title: "Open failed",
          description: "Unable to open attachments.",
          variant: "error",
        });
        return;
      }
      const ix = Math.max(0, Math.min(focusIndex, files.length - 1));
      openPreview({ files, initialIndex: ix, onClosed: () => {} });
    },
    [supabase, expense, attachmentPreviewSrc, openPreview, toast]
  );

  const byProject = React.useMemo(() => {
    if (!expense) return new Map<string | null, number>();
    const map = new Map<string | null, number>();
    for (const line of expense.lines) {
      const key = line.projectId;
      map.set(key, (map.get(key) ?? 0) + line.amount);
    }
    return map;
  }, [expense]);

  const total = expense ? getExpenseTotal(expense) : 0;
  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  React.useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  if (notFoundState) notFound();
  if (!expense) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const handleSaveHeader = async () => {
    if (!expense) return;
    const form = document.querySelector("[data-expense-header-form]") as HTMLFormElement;
    if (!form) return;
    const formData = new FormData(form);
    await updateExpense(expense.id, {
      date: (formData.get("date") as string) || expense.date,
      vendorName,
      accountId: accountId || undefined,
      paymentAccountId: paymentAccountId.trim() || null,
      referenceNo: (formData.get("referenceNo") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
    const pa = paymentAccountId.trim();
    if (pa && vendorName.trim()) {
      rememberExpenseVendorPaymentAccount(vendorName.trim(), pa);
      persistLastExpensePaymentAccountId(pa);
    }
    await refresh();
  };

  const handleLineChange = async (lineId: string, patch: Partial<ExpenseLine>) => {
    if (!expense) return;
    await updateExpenseLine(expense.id, lineId, patch);
    await syncWorkflowStatusFromFirstLine();
    await refresh();
  };

  const handleAddLine = async () => {
    if (!expense) return;
    await addExpenseLine(expense.id, { projectId: null, category: "Other", amount: 0 });
    await syncWorkflowStatusFromFirstLine();
    await refresh();
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!expense) return;
    await deleteExpenseLine(expense.id, lineId);
    await syncWorkflowStatusFromFirstLine();
    await refresh();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !expense) return;
    if (!supabase) {
      toast({
        title: "Upload failed",
        description: configured ? "Supabase client unavailable." : "Supabase is not configured.",
        variant: "error",
      });
      return;
    }
    setAttachmentUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `expenses/${expense.id}/${safeName}`;
        const uploadRes = await supabase.storage
          .from("expense-attachments")
          .upload(filePath, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (uploadRes.error) throw uploadRes.error;
        const att = { ...makeAttachment(file), url: filePath };
        await addExpenseAttachment(expense.id, att);
      }
      toast({ title: "Receipt uploaded", description: "Attachment saved.", variant: "success" });
      setToastMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      toast({ title: "Upload failed", description: msg, variant: "error" });
    } finally {
      setAttachmentUploading(false);
    }
    e.target.value = "";
    await refresh();
  };

  const handleRemoveAttachment = async (att: ExpenseAttachment) => {
    if (!expense) return;
    if (!window.confirm("Delete attachment?")) return;
    await deleteExpenseAttachment(expense.id, att.id);
    await refresh();
  };

  const handleDownload = (att: ExpenseAttachment) => {
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.storage
        .from("expense-attachments")
        .createSignedUrl(att.url, 60);
      if (error || !data?.signedUrl) {
        toast({
          title: "Download failed",
          description: error?.message ?? "Unable to create signed URL.",
          variant: "error",
        });
        return;
      }
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = att.fileName;
      a.click();
    })();
  };

  return (
    <div className="mx-auto max-w-[1200px] flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/financial/expenses"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <section className="border-b border-gray-100 pb-6 dark:border-border">
        {toastMessage && (
          <p className="mb-4 text-sm text-text-primary dark:text-foreground">{toastMessage}</p>
        )}
        <form data-expense-header-form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <CreatableSelect
                label="Vendor"
                value={vendorName}
                options={vendorsList}
                placeholder="Vendor name"
                onChange={setVendorName}
                onCreate={async (name) => {
                  const toSelect = await addVendor(name);
                  if (toSelect) {
                    setVendorName(toSelect);
                    setToastMessage(`Added vendor: ${toSelect}`);
                    setVendorsList((prev) =>
                      prev.includes(toSelect) ? prev : [...prev, toSelect]
                    );
                  }
                }}
              />
              {vendorName && vendorDisabled && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">
                  Disabled
                </span>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Date
              </label>
              <Input
                name="date"
                type="date"
                defaultValue={expense.date}
                className="mt-1 h-10 rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payment source
              </label>
              <Select
                value={accountId.trim() ? accountId : EXPENSE_ACCOUNT_SELECT_NONE}
                onValueChange={(v) => setAccountId(v === EXPENSE_ACCOUNT_SELECT_NONE ? "" : v)}
              >
                <SelectTrigger className="mt-1 h-10 w-full rounded-sm border-border/60 text-sm">
                  <SelectValue placeholder="Select payment source" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value={EXPENSE_ACCOUNT_SELECT_NONE}>Select payment source</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.lastFour ? `${acc.name} •••• ${acc.lastFour}` : acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payment
              </label>
              <PaymentAccountSelect
                value={paymentAccountId}
                onValueChange={(id) => {
                  setPaymentAccountId(id);
                  persistLastExpensePaymentAccountId(id);
                }}
                onAccountsUpdated={handlePaymentAccountsUpdated}
                className="mt-1 h-10 w-full rounded-sm border-border/60 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reference #
              </label>
              <Input
                name="referenceNo"
                defaultValue={expense.referenceNo ?? ""}
                className="mt-1 h-10 rounded-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <Textarea
              name="notes"
              defaultValue={expense.notes ?? ""}
              className="mt-1 min-h-[88px] rounded-sm text-sm"
              placeholder="Optional"
              rows={3}
            />
          </div>
          <Button type="button" size="sm" className="rounded-sm" onClick={handleSaveHeader}>
            Save header
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Receipt attachments</h2>
        {expense.receiptUrl || firstImageSigned ? (
          <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-border/60 pb-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Primary receipt
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {(expense.receiptUrl && receiptHrefLooksImage(expense.receiptUrl)) ||
                (!expense.receiptUrl && firstImageSigned) ? (
                  <button
                    type="button"
                    className="cursor-pointer overflow-hidden rounded-sm border border-border/60 transition-transform duration-200 ease-out hover:scale-105"
                    onClick={openPrimaryReceiptPreview}
                    aria-label="Open primary receipt"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic receipt URL */}
                    <img
                      src={
                        expense.receiptUrl && receiptHrefLooksImage(expense.receiptUrl)
                          ? (receiptSignedUrl ?? expense.receiptUrl)
                          : (firstImageSigned ?? "")
                      }
                      alt=""
                      className="h-16 w-16 object-cover"
                      loading="lazy"
                    />
                  </button>
                ) : null}
                {expense.receiptUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    type="button"
                    onClick={openReceiptInNewTab}
                  >
                    View attachment
                  </Button>
                ) : firstImageAttachment && firstImageSigned ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    type="button"
                    onClick={openPrimaryReceiptPreview}
                  >
                    Preview
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          className="rounded-sm"
          disabled={attachmentUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {attachmentUploading ? (
            <>
              <InlineLoading className="mr-2 h-4 w-4" size="md" aria-hidden />
              Uploading…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add receipt
            </>
          )}
        </Button>
        <ul className="mt-3 space-y-2">
          {expense.attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-3 border border-gray-100 p-3 dark:border-border"
            >
              <button
                type="button"
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
                onClick={() => {
                  const i = expense.attachments.findIndex((a) => a.id === att.id);
                  void openAttachmentCarouselAt(i >= 0 ? i : 0);
                }}
              >
                {attachmentIsImage(att) && attachmentPreviewSrc[att.id] ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */
                  <img
                    src={attachmentPreviewSrc[att.id]}
                    alt=""
                    className="h-10 w-10 shrink-0 cursor-pointer rounded-sm border border-border/60 object-cover transition-transform duration-200 hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-medium truncate">{att.fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {att.size > 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${att.size} B`}
                </span>
              </button>
              <Button
                variant="outline"
                size="icon"
                className="btn-outline-ghost h-8 w-8"
                onClick={() => handleDownload(att)}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="btn-outline-ghost h-8 w-8 text-destructive"
                onClick={() => handleRemoveAttachment(att)}
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="overflow-hidden rounded-sm border border-gray-100 p-6 dark:border-border">
          <SplitLinesEditor
            lines={expense.lines.map((l) => ({
              id: l.id,
              projectId: l.projectId,
              category: l.category,
              costCode: l.costCode ?? null,
              memo: l.memo ?? null,
              amount: l.amount,
            }))}
            onLineChange={(lineId, patch) => {
              handleLineChange(lineId, patch);
            }}
            onAddLine={handleAddLine}
            onDeleteLine={handleDeleteLine}
            showCostCode
            projects={projects}
            categories={categories}
            vendorsList={vendorsList}
            paymentMethodsList={accounts.map((a) =>
              a.lastFour ? `${a.name} •••• ${a.lastFour}` : a.name
            )}
            onAddCategory={addExpenseCategory}
            onAddVendor={addVendor}
            onAddPaymentMethod={async (name) => name}
            onToast={setToastMessage}
            isExpenseCategoryDisabled={() => false}
            isVendorDisabled={() => false}
            isPaymentMethodDisabled={() => false}
            minLines={1}
          />
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="min-w-[200px] border border-gray-100 bg-background px-4 py-3 dark:border-border">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Lines total
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-red-600/90 dark:text-red-400/90">
              ${total.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 border border-gray-100 bg-background px-4 py-3 dark:border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Per project
            </p>
            <ul className="space-y-1 text-sm">
              {Array.from(byProject.entries()).map(([projectId, amount]) => (
                <li key={projectId ?? "overhead"} className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">
                    {projectId == null ? "Overhead" : (projectNameById.get(projectId) ?? projectId)}
                  </span>
                  <span>${amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
