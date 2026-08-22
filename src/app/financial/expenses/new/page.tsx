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
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { ExpenseDatePicker } from "@/components/expense-date-picker";
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useToast } from "@/components/toast/toast-provider";
import {
  createExpense,
  getProjects,
  getVendors,
  getPaymentAccounts,
  getSubcontractDeductionOptions,
  updateExpenseReceiptUrl,
  updateExpenseForReview,
  type PaymentAccountRow,
  type SubcontractDeductionOption,
} from "@/lib/data";
import { getAccountsAction } from "@/app/financial/accounts/actions";
import { PaymentAccountSelect } from "@/components/payment-account-select";
import { ExpenseSubcontractDeductionFields } from "@/components/expense-subcontract-deduction-fields";
import {
  pickDefaultPaymentAccountId,
  persistLastExpensePaymentAccountId,
  rememberExpenseVendorPaymentAccount,
} from "@/lib/expense-payment-preferences";
import {
  deriveExpenseWorkflowStatus,
  expenseCostAllocationRequiresProject,
  EXPENSE_COST_ALLOCATION_OVERHEAD,
  EXPENSE_COST_ALLOCATION_PROJECT_COST,
  EXPENSE_ACCOUNT_SELECT_NONE,
  EXPENSE_PROJECT_SELECT_NONE,
  type ExpenseCostAllocation,
} from "@/lib/expense-workflow-status";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";

type ProjectOption = { id: string; name: string | null };

const FIELD_LABEL = "text-xs uppercase tracking-normal text-muted-foreground";
const CONTROL_CLASS = "h-10 rounded-sm border-border/60 text-sm";
const SELECT_TRIGGER = cn(CONTROL_CLASS, "[&>span]:line-clamp-1");

type LineForm = {
  id: string;
  costAllocation: ExpenseCostAllocation;
  projectId: string | null;
  category: string;
  memo: string;
  amount: string;
};

function newLine(): LineForm {
  return {
    id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    costAllocation: EXPENSE_COST_ALLOCATION_OVERHEAD,
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

async function addVendorViaApi(name: string): Promise<string> {
  const v = name.trim();
  if (!v) return "";
  const response = await fetch("/api/vendors", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: v, status: "active" }),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    vendor?: { name?: string | null };
  } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || "Failed to save vendor.");
  }
  return payload?.vendor?.name?.trim() || v;
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
  const [subcontractDeductionOptions, setSubcontractDeductionOptions] = React.useState<
    SubcontractDeductionOption[]
  >([]);

  const [date, setDate] = React.useState(() => hawaiiTodayYmd());
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
  const [deductFromSubcontractor, setDeductFromSubcontractor] = React.useState(false);
  const [deductionSubcontractId, setDeductionSubcontractId] = React.useState("");
  const [deductionAmount, setDeductionAmount] = React.useState("");
  const [deductionNote, setDeductionNote] = React.useState("");
  const paymentChoiceTouchedRef = React.useRef(false);

  const loadLookups = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, v, accountResult, payAccs, deductionOptions] = await Promise.all([
        getProjects(),
        getVendors(),
        getAccountsAction(),
        getPaymentAccounts().catch(() => [] as PaymentAccountRow[]),
        getSubcontractDeductionOptions().catch(() => [] as SubcontractDeductionOption[]),
      ]);
      setProjects(p as unknown as ProjectOption[]);
      setVendors(v);
      setAccounts(accountResult.accounts);
      setPaymentAccountRows(payAccs);
      setSubcontractDeductionOptions(deductionOptions);
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
  const primaryProjectId = effectiveLines.find((line) => line.projectId)?.projectId ?? null;

  React.useEffect(() => {
    if (!deductFromSubcontractor) return;
    if (deductionAmount.trim()) return;
    if (total > 0) setDeductionAmount(String(Math.round(total * 100) / 100));
  }, [deductFromSubcontractor, deductionAmount, total]);

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
    const projectCostLine = effectiveLines.find(
      (line) => expenseCostAllocationRequiresProject(line.costAllocation) && !line.projectId
    );
    if (projectCostLine) {
      toast({
        title: "Missing project",
        description:
          "Project Cost expenses must be assigned to a project. Choose Overhead only for company expenses.",
        variant: "error",
      });
      return false;
    }
    const selectedDeductionOption = subcontractDeductionOptions.find(
      (option) => option.subcontractId === deductionSubcontractId
    );
    const deductionAmountValue = Number(deductionAmount);
    if (deductFromSubcontractor) {
      if (!primaryProjectId) {
        toast({
          title: "Missing project",
          description: "A subcontractor deduction must be tied to a project expense.",
          variant: "error",
        });
        return false;
      }
      if (!selectedDeductionOption) {
        toast({
          title: "Missing subcontractor",
          description: "Choose which subcontractor payable this expense should reduce.",
          variant: "error",
        });
        return false;
      }
      if (!Number.isFinite(deductionAmountValue) || deductionAmountValue <= 0) {
        toast({
          title: "Invalid deduction",
          description: "Deduction amount must be greater than 0.",
          variant: "error",
        });
        return false;
      }
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
      const selectedAccount = accounts.find((account) => account.id === accountId);
      const created = await createExpense({
        date,
        vendorName: vendorName.trim(),
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        accountId: accountId || undefined,
        paymentMethod: selectedAccount?.name,
        paymentAccountId: paymentAccountId.trim() || null,
        lines: effectiveLines.map((l) => ({
          projectId: l.projectId,
          category: (l.category || "Other").trim() || "Other",
          memo: l.memo.trim() || null,
          amount: safeAmount(l.amount),
        })),
        subcontractDeduction: deductFromSubcontractor
          ? {
              subcontractId: deductionSubcontractId,
              projectId: primaryProjectId,
              amount: Number(deductionAmount),
              note: deductionNote.trim() || null,
            }
          : null,
      });
      if (receiptFile) {
        const uploadData = new FormData();
        uploadData.set("file", receiptFile);
        const uploadResponse = await fetch("/api/quick-expense/upload-attachment", {
          method: "POST",
          body: uploadData,
          credentials: "same-origin",
        });
        const uploadBody = (await uploadResponse.json().catch(() => ({}))) as {
          ok?: boolean;
          path?: string;
        };
        if (!uploadResponse.ok || !uploadBody.ok || !uploadBody.path) {
          throw new Error("Receipt upload failed.");
        }
        await updateExpenseReceiptUrl(created.id, uploadBody.path);
      }
      const pa = paymentAccountId.trim();
      if (pa) {
        persistLastExpensePaymentAccountId(pa);
        rememberExpenseVendorPaymentAccount(vendorName.trim(), pa);
      }
      const head = effectiveLines[0];
      await updateExpenseForReview(created.id, {
        status: deriveExpenseWorkflowStatus(
          head?.projectId ?? null,
          head?.category ?? "",
          head?.costAllocation ?? EXPENSE_COST_ALLOCATION_OVERHEAD
        ),
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
            <h2 className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-normal">
                  Vendor
                </label>
                <CreatableSelect
                  label=""
                  value={vendorName}
                  options={vendors}
                  placeholder="Vendor name"
                  onChange={setVendorName}
                  onCreate={async (name) => {
                    try {
                      const v = await addVendorViaApi(name);
                      if (v) {
                        setVendorName(v);
                        setVendors((prev) => (prev.includes(v) ? prev : [...prev, v]));
                      }
                    } catch (error) {
                      toast({
                        title: "Vendor not saved",
                        description:
                          error instanceof Error ? error.message : "Failed to save vendor.",
                        variant: "error",
                      });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className={FIELD_LABEL}>Date</label>
                <ExpenseDatePicker
                  id="new-expense-date"
                  value={date}
                  onChange={setDate}
                  className={CONTROL_CLASS}
                />
              </div>
              {!showSplitLines ? (
                <>
                  <div className="space-y-2 md:col-span-2 lg:col-span-3">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Classification</label>
                        <ExpenseSearchableSelect
                          id="new-expense-cost-allocation-select"
                          disabled={loading}
                          value={lines[0]?.costAllocation ?? EXPENSE_COST_ALLOCATION_OVERHEAD}
                          className={SELECT_TRIGGER}
                          placeholder="Classification"
                          searchPlaceholder="Search classification…"
                          emptyText="No matching classifications"
                          options={[
                            {
                              value: EXPENSE_COST_ALLOCATION_OVERHEAD,
                              label: "Overhead",
                              searchText: "company overhead",
                            },
                            {
                              value: EXPENSE_COST_ALLOCATION_PROJECT_COST,
                              label: "Project Cost",
                              searchText: "project cost",
                            },
                          ]}
                          onValueChange={(v) => {
                            const next = v as ExpenseCostAllocation;
                            setLines((prev) => {
                              const row = prev[0] ?? newLine();
                              const rest = prev.slice(1);
                              return [
                                {
                                  ...row,
                                  costAllocation: next,
                                  projectId:
                                    next === EXPENSE_COST_ALLOCATION_OVERHEAD
                                      ? null
                                      : row.projectId,
                                },
                                ...rest,
                              ];
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Project</label>
                        <ExpenseSearchableSelect
                          id="new-expense-project-select"
                          disabled={loading}
                          value={
                            lines[0]?.projectId && String(lines[0].projectId).trim() !== ""
                              ? lines[0]!.projectId!
                              : EXPENSE_PROJECT_SELECT_NONE
                          }
                          className={SELECT_TRIGGER}
                          placeholder="Project"
                          searchPlaceholder="Search projects…"
                          emptyText="No matching projects"
                          options={[
                            {
                              value: EXPENSE_PROJECT_SELECT_NONE,
                              label: "Overhead",
                              searchText: "no project overhead unassigned",
                            },
                            ...projects.map((p) => ({
                              value: p.id,
                              label: p.name ?? p.id,
                              searchText: p.id,
                            })),
                          ]}
                          onValueChange={(v) => {
                            const proj = v === EXPENSE_PROJECT_SELECT_NONE ? null : v;
                            setLines((prev) => {
                              const row = prev[0] ?? newLine();
                              const rest = prev.slice(1);
                              return [
                                {
                                  ...row,
                                  projectId: proj,
                                  costAllocation: proj
                                    ? EXPENSE_COST_ALLOCATION_PROJECT_COST
                                    : row.costAllocation,
                                },
                                ...rest,
                              ];
                            });
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className={FIELD_LABEL}>Category</label>
                        <ExpenseCategorySelect
                          id="new-expense-category-select"
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
                          id="new-expense-payment-select"
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
              <div className="space-y-2 md:col-span-2">
                <ExpenseSubcontractDeductionFields
                  idPrefix="new-expense-subcontract-deduction"
                  enabled={deductFromSubcontractor}
                  onEnabledChange={setDeductFromSubcontractor}
                  projectId={primaryProjectId}
                  subcontractId={deductionSubcontractId}
                  onSubcontractIdChange={setDeductionSubcontractId}
                  amount={deductionAmount}
                  onAmountChange={setDeductionAmount}
                  note={deductionNote}
                  onNoteChange={setDeductionNote}
                  options={subcontractDeductionOptions}
                  disabled={loading || saving}
                  triggerClassName={SELECT_TRIGGER}
                  inputClassName={CONTROL_CLASS}
                />
              </div>
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
                  <ExpenseSearchableSelect
                    id="new-expense-payment-source-select"
                    value={accountId.trim() ? accountId : EXPENSE_ACCOUNT_SELECT_NONE}
                    className={SELECT_TRIGGER}
                    placeholder="Select payment source"
                    searchPlaceholder="Search payment sources…"
                    emptyText="No matching payment sources"
                    options={[
                      {
                        value: EXPENSE_ACCOUNT_SELECT_NONE,
                        label: "Select payment source",
                        searchText: "none no payment source",
                      },
                      ...accounts.map((acc) => ({
                        value: acc.id,
                        label: acc.lastFour ? `${acc.name} •••• ${acc.lastFour}` : acc.name,
                        searchText: `${acc.id} ${acc.name} ${acc.lastFour ?? ""}`,
                      })),
                    ]}
                    onValueChange={(v) => setAccountId(v === EXPENSE_ACCOUNT_SELECT_NONE ? "" : v)}
                  />
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
              <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
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
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-sm border border-border/60 text-hh-status font-medium text-muted-foreground transition-transform duration-200 ease-out hover:scale-105"
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
                  <div
                    key={l.id}
                    className="grid gap-3 md:grid-cols-[1fr_140px_160px_160px_140px_36px]"
                  >
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
                    <ExpenseSearchableSelect
                      disabled={loading}
                      value={l.costAllocation}
                      className={cn(SELECT_TRIGGER, "text-xs")}
                      placeholder="Classification"
                      searchPlaceholder="Search classification…"
                      emptyText="No matching classifications"
                      options={[
                        {
                          value: EXPENSE_COST_ALLOCATION_OVERHEAD,
                          label: "Overhead",
                          searchText: "company overhead",
                        },
                        {
                          value: EXPENSE_COST_ALLOCATION_PROJECT_COST,
                          label: "Project Cost",
                          searchText: "project cost",
                        },
                      ]}
                      onValueChange={(v) => {
                        const next = v as ExpenseCostAllocation;
                        setLines((prev) =>
                          prev.map((x) =>
                            x.id === l.id
                              ? {
                                  ...x,
                                  costAllocation: next,
                                  projectId:
                                    next === EXPENSE_COST_ALLOCATION_OVERHEAD ? null : x.projectId,
                                }
                              : x
                          )
                        );
                      }}
                    />
                    <ExpenseSearchableSelect
                      disabled={loading}
                      value={
                        l.projectId && String(l.projectId).trim() !== ""
                          ? l.projectId
                          : EXPENSE_PROJECT_SELECT_NONE
                      }
                      className={cn(SELECT_TRIGGER, "text-xs")}
                      placeholder="Project"
                      searchPlaceholder="Search projects…"
                      emptyText="No matching projects"
                      options={[
                        {
                          value: EXPENSE_PROJECT_SELECT_NONE,
                          label: "Overhead",
                          searchText: "no project overhead unassigned",
                        },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name ?? p.id,
                          searchText: p.id,
                        })),
                      ]}
                      onValueChange={(v) => {
                        const proj = v === EXPENSE_PROJECT_SELECT_NONE ? null : v;
                        setLines((prev) =>
                          prev.map((x) =>
                            x.id === l.id
                              ? {
                                  ...x,
                                  projectId: proj,
                                  costAllocation: proj
                                    ? EXPENSE_COST_ALLOCATION_PROJECT_COST
                                    : x.costAllocation,
                                }
                              : x
                          )
                        );
                      }}
                    />
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
                <span className="tabular-nums font-medium">{formatCurrency(total)}</span>
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
