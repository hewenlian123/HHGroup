"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useToast } from "@/components/toast/toast-provider";
import {
  createExpense,
  getProjects,
  getVendors,
  addVendor,
  getAccounts,
  getPaymentAccounts,
  updateExpenseReceiptUrl,
  updateExpenseForReview,
  type PaymentAccountRow,
} from "@/lib/data";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import {
  pickDefaultPaymentAccountId,
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import { createBrowserClient } from "@/lib/supabase";
import {
  deriveExpenseWorkflowStatus,
  EXPENSE_ACCOUNT_SELECT_NONE,
  EXPENSE_PROJECT_SELECT_NONE,
} from "@/lib/expense-workflow-status";
import { cn } from "@/lib/utils";

type ProjectOption = { id: string; name: string | null };

const FIELD_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";
const CONTROL_CLASS = "h-10 rounded-sm border-border/60 text-sm";
const SELECT_TRIGGER = cn(CONTROL_CLASS, "[&>span]:line-clamp-1");

const selectPopperContentProps = {
  position: "popper" as const,
  sideOffset: 4,
  className: "z-[200] max-h-[min(280px,var(--radix-select-content-available-height))]",
};

type LineForm = {
  id: string;
  projectId: string | null;
  category: string;
  memo: string;
  amount: string;
};

function newLine(): LineForm {
  return {
    id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: null,
    category: "Other",
    memo: "",
    amount: "",
  };
}

function safeAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseCurrency(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function NewExpensePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [vendors, setVendors] = React.useState<string[]>([]);

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [vendorName, setVendorName] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineForm[]>([newLine()]);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showSplitLines, setShowSplitLines] = React.useState(false);
  const { openPreview, closePreview } = useAttachmentPreview();

  const [accounts, setAccounts] = React.useState<
    Array<{ id: string; name: string; type: string; lastFour: string | null }>
  >([]);
  const [paymentAccountRows, setPaymentAccountRows] = React.useState<PaymentAccountRow[]>([]);
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const paymentChoiceTouchedRef = React.useRef(false);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  const loadLookups = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, v, accs, payAccs] = await Promise.all([
        getProjects(),
        getVendors(),
        getAccounts().catch(() => []),
        getPaymentAccounts().catch(() => [] as PaymentAccountRow[]),
      ]);
      setProjects(p as unknown as ProjectOption[]);
      setVendors(v);
      setAccounts(accs);
      setPaymentAccountRows(payAccs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load lookups.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  React.useEffect(() => {
    if (loading || paymentAccountRows.length === 0) return;
    if (paymentChoiceTouchedRef.current) return;
    setPaymentAccountId(pickDefaultPaymentAccountId(paymentAccountRows, vendorName));
  }, [vendorName, paymentAccountRows, loading]);

  useOnAppSync(
    React.useCallback(() => {
      void loadLookups();
    }, [loadLookups]),
    [loadLookups]
  );

  const effectiveLines = React.useMemo((): LineForm[] => {
    if (showSplitLines) return lines;
    const base = lines[0] ?? newLine();
    return [{ ...base, amount: amountInput }];
  }, [showSplitLines, lines, amountInput]);

  const total = React.useMemo(
    () => effectiveLines.reduce((s, l) => s + safeAmount(l.amount), 0),
    [effectiveLines]
  );

  const receiptPreviewUrl = React.useMemo(() => {
    if (!receiptFile) return null;
    if (receiptFile.type.startsWith("image/") || receiptFile.type === "application/pdf") {
      return URL.createObjectURL(receiptFile);
    }
    return null;
  }, [receiptFile]);
  React.useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  const receiptPreviewFileType = React.useMemo((): "image" | "pdf" => {
    if (receiptFile?.type === "application/pdf") return "pdf";
    return "image";
  }, [receiptFile]);

  const validate = (): boolean => {
    const v = vendorName.trim();
    if (!v) {
      toast({ title: "Missing vendor", description: "Vendor name is required.", variant: "error" });
      return false;
    }
    const amount = parseCurrency(amountInput);
    if (!(amount > 0)) {
      toast({
        title: "Missing amount",
        description: "Amount must be greater than 0.",
        variant: "error",
      });
      return false;
    }
    if (!(total > 0)) {
      toast({
        title: "Missing split lines",
        description: "At least one split line amount is required.",
        variant: "error",
      });
      return false;
    }
    if (Math.round(amount * 100) !== Math.round(total * 100)) {
      toast({
        title: "Amounts do not match",
        description: showSplitLines
          ? "Total of split lines must match the Amount field."
          : "Line amounts must match the Amount field.",
        variant: "error",
      });
      return false;
    }
    return true;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const created = await createExpense({
        date,
        vendorName: vendorName.trim(),
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        accountId: accountId || undefined,
        paymentAccountId: paymentAccountId.trim() || null,
        lines: effectiveLines.map((l) => ({
          projectId: l.projectId,
          category: (l.category || "Other").trim() || "Other",
          memo: l.memo.trim() || null,
          amount: safeAmount(l.amount),
        })),
      });
      if (receiptFile && supabase) {
        const path = `receipts/${created.id}/${receiptFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, receiptFile, {
            contentType: receiptFile.type || "application/octet-stream",
            upsert: true,
          });
        if (uploadError) throw new Error(uploadError.message);
        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
        await updateExpenseReceiptUrl(created.id, urlData.publicUrl);
      }
      const pa = paymentAccountId.trim();
      if (pa) {
        persistLastExpensePaymentAccountId(pa);
        rememberExpenseVendorPaymentAccount(vendorName.trim(), pa);
      }
      const head = effectiveLines[0];
      await updateExpenseForReview(created.id, {
        status: deriveExpenseWorkflowStatus(head?.projectId ?? null, head?.category ?? ""),
      });
      toast({ title: "Created", description: "Expense created.", variant: "success" });
      router.push("/financial/expenses");
      syncRouterNonBlocking(router);
    } catch (e2: unknown) {
      const msg = e2 instanceof Error ? e2.message : "Failed to create expense.";
      setError(msg);
      toast({ title: "Create failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container page-stack flex justify-center py-6 md:py-8">
      <div className="w-full max-w-3xl space-y-7">
        <PageHeader
          title="New expense"
          description="Full entry for complex bills; use Quick expense on the list for daily items."
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="space-y-3 border-b border-border/60 pb-6">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Core
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className={FIELD_LABEL}>Amount</label>
                <div className="flex h-10 items-center gap-2 rounded-sm border border-input px-3">
                  <span className="text-sm font-medium text-muted-foreground">$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 border-0 bg-transparent p-0 text-lg tabular-nums shadow-none focus-visible:ring-0"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Vendor
                </label>
                <CreatableSelect
                  label=""
                  value={vendorName}
                  options={vendors}
                  placeholder="Vendor name"
                  onChange={setVendorName}
                  onCreate={async (name) => {
                    const v = await addVendor(name);
                    if (v) {
                      setVendorName(v);
                      setVendors((prev) => (prev.includes(v) ? prev : [...prev, v]));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className={FIELD_LABEL}>Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={CONTROL_CLASS}
                  required
                />
              </div>
              {!showSplitLines ? (
                <>
                  <div className="space-y-2 md:col-span-2 lg:col-span-3">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Project</label>
                        <Select
                          disabled={loading}
                          value={
                            lines[0]?.projectId && String(lines[0].projectId).trim() !== ""
                              ? lines[0]!.projectId!
                              : EXPENSE_PROJECT_SELECT_NONE
                          }
                          onValueChange={(v) => {
                            const proj = v === EXPENSE_PROJECT_SELECT_NONE ? null : v;
                            setLines((prev) => {
                              const row = prev[0] ?? newLine();
                              const rest = prev.slice(1);
                              return [{ ...row, projectId: proj }, ...rest];
                            });
                          }}
                        >
                          <SelectTrigger className={SELECT_TRIGGER}>
                            <SelectValue placeholder="Project" />
                          </SelectTrigger>
                          <SelectContent {...selectPopperContentProps}>
                            <SelectItem value={EXPENSE_PROJECT_SELECT_NONE}>Overhead</SelectItem>
                            {projects.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name ?? p.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Category</label>
                        <ExpenseCategorySelect
                          value={lines[0]?.category ?? "Other"}
                          preserveArchivedValue={false}
                          onValueChange={(v) => {
                            setLines((prev) => {
                              const row = prev[0] ?? newLine();
                              const rest = prev.slice(1);
                              return [{ ...row, category: v }, ...rest];
                            });
                          }}
                          className={SELECT_TRIGGER}
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Payment</label>
                        <PaymentAccountSelect
                          value={paymentAccountId}
                          onValueChange={(id) => {
                            paymentChoiceTouchedRef.current = true;
                            setPaymentAccountId(id);
                            persistLastExpensePaymentAccountId(id);
                          }}
                          disabled={loading || saving}
                          onAccountsUpdated={setPaymentAccountRows}
                          className={SELECT_TRIGGER}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "More"} options
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-ghost h-8"
              onClick={() => setShowSplitLines((v) => !v)}
            >
              {showSplitLines ? "Single line" : "Split across projects"}
            </Button>
          </div>

          {showAdvanced ? (
            <section className="space-y-4 border-b border-border/60 pb-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Payment source</label>
                  <Select
                    value={accountId.trim() ? accountId : EXPENSE_ACCOUNT_SELECT_NONE}
                    onValueChange={(v) => setAccountId(v === EXPENSE_ACCOUNT_SELECT_NONE ? "" : v)}
                  >
                    <SelectTrigger className={SELECT_TRIGGER}>
                      <SelectValue placeholder="Select payment source" />
                    </SelectTrigger>
                    <SelectContent {...selectPopperContentProps}>
                      <SelectItem value={EXPENSE_ACCOUNT_SELECT_NONE}>
                        Select payment source
                      </SelectItem>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.lastFour ? `${acc.name} •••• ${acc.lastFour}` : acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Reference #</label>
                  <Input
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className={CONTROL_CLASS}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className={FIELD_LABEL}>Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(CONTROL_CLASS, "min-h-[88px] resize-y py-2")}
                  placeholder="Optional"
                  rows={3}
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Receipt</h2>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/*"
              capture="environment"
              className="hidden"
              id="receipt-upload"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="receipt-upload"
              className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) setReceiptFile(file);
              }}
            >
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Drag receipt here
              </span>
              <span className="mt-1 text-sm text-foreground">or click to upload</span>
              <span className="mt-1 text-xs text-muted-foreground">
                Supported formats: JPG, PNG, PDF
              </span>
              {receiptFile ? (
                <span className="mt-2 text-xs text-foreground">Selected: {receiptFile.name}</span>
              ) : null}
            </label>
            {receiptPreviewUrl && receiptFile?.type.startsWith("image/") ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openPreview({
                      url: receiptPreviewUrl,
                      fileName: receiptFile.name ?? "Receipt",
                      fileType: receiptPreviewFileType,
                    })
                  }
                  className="cursor-pointer overflow-hidden rounded-sm border border-border/60 p-0.5 transition-transform duration-200 ease-out hover:scale-105"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptPreviewUrl} alt="" className="h-16 w-16 object-cover" />
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    openPreview({
                      url: receiptPreviewUrl,
                      fileName: receiptFile.name ?? "Receipt",
                      fileType: receiptPreviewFileType,
                    })
                  }
                >
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn-outline-ghost h-8"
                  onClick={() => {
                    closePreview();
                    setReceiptFile(null);
                    const el = document.getElementById("receipt-upload") as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : receiptFile?.type === "application/pdf" && receiptPreviewUrl ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openPreview({
                      url: receiptPreviewUrl,
                      fileName: receiptFile.name ?? "Receipt",
                      fileType: "pdf",
                    })
                  }
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-sm border border-border/60 text-[10px] font-medium text-muted-foreground transition-transform duration-200 ease-out hover:scale-105"
                >
                  PDF
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    openPreview({
                      url: receiptPreviewUrl,
                      fileName: receiptFile.name ?? "Receipt",
                      fileType: "pdf",
                    })
                  }
                >
                  Preview
                </Button>
              </div>
            ) : receiptFile ? (
              <p className="mt-2 text-xs text-muted-foreground">
                PDF / file attached — preview after save.
              </p>
            ) : null}
          </section>

          {showSplitLines ? (
            <section className="space-y-3 border-b border-border/60 pb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">Split lines</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  Add line
                </Button>
              </div>

              <div className="space-y-3">
                {lines.map((l, idx) => (
                  <div key={l.id} className="grid gap-3 md:grid-cols-[1fr_160px_160px_140px_36px]">
                    <Input
                      value={l.memo}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, memo: e.target.value } : x))
                        )
                      }
                      className={CONTROL_CLASS}
                      placeholder="Memo / description"
                    />
                    <Select
                      disabled={loading}
                      value={
                        l.projectId && String(l.projectId).trim() !== ""
                          ? l.projectId
                          : EXPENSE_PROJECT_SELECT_NONE
                      }
                      onValueChange={(v) => {
                        const proj = v === EXPENSE_PROJECT_SELECT_NONE ? null : v;
                        setLines((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, projectId: proj } : x))
                        );
                      }}
                    >
                      <SelectTrigger className={cn(SELECT_TRIGGER, "text-xs")}>
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent {...selectPopperContentProps}>
                        <SelectItem value={EXPENSE_PROJECT_SELECT_NONE}>Overhead</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name ?? p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ExpenseCategorySelect
                      value={l.category}
                      preserveArchivedValue={false}
                      onValueChange={(v) =>
                        setLines((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, category: v } : x))
                        )
                      }
                      className={cn(SELECT_TRIGGER, "text-xs")}
                      disabled={loading}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.amount}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, amount: e.target.value } : x))
                        )
                      }
                      className={cn(CONTROL_CLASS, "tabular-nums")}
                      placeholder="0.00"
                      required={idx === 0}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="btn-outline-ghost h-9 w-9 text-destructive"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((x) => x.id !== l.id)
                        )
                      }
                      aria-label="Remove"
                      disabled={lines.length <= 1}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="tabular-nums font-medium">${total.toLocaleString()}</span>
              </div>
            </section>
          ) : null}

          <section className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-ghost h-8"
              onClick={() => router.push("/financial/expenses")}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8" disabled={saving}>
              {saving ? "Creating…" : "Save expense"}
            </Button>
          </section>
        </form>
      </div>
    </div>
  );
}
