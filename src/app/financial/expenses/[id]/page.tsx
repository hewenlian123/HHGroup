"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getExpenseById,
  getProjects,
  getExpenseCategories,
  getVendors,
  getPaymentMethods,
  addExpenseCategory,
  addVendor,
  addPaymentMethod,
  isExpenseCategoryDisabled,
  isVendorDisabled,
  isPaymentMethodDisabled,
  getExpenseTotal,
  updateExpense,
  addExpenseLine,
  updateExpenseLine,
  deleteExpenseLine,
  addExpenseAttachment,
  deleteExpenseAttachment,
  type Expense,
  type ExpenseAttachment,
  type ExpenseLine,
} from "@/lib/data";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { SplitLinesEditor } from "@/components/split-lines-editor";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import { ArrowLeft, Plus, FileText, Download, Trash2 } from "lucide-react";
import { getProjectById } from "@/lib/data";

function makeAttachment(file: File): ExpenseAttachment {
  const url = URL.createObjectURL(file);
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    url,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export default function ExpenseDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [expense, setExpense] = React.useState<Expense | null>(null);
  const [notFoundState, setNotFoundState] = React.useState(false);
  const [vendorName, setVendorName] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("ACH");
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<ExpenseAttachment | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!id) {
      setNotFoundState(true);
      return;
    }
    const e = getExpenseById(id);
    if (!e) setNotFoundState(true);
    else {
      setExpense(e);
      setVendorName(e.vendorName);
      setPaymentMethod(e.paymentMethod);
    }
  }, [id]);

  const refresh = React.useCallback(() => {
    if (!id) return;
    const e = getExpenseById(id);
    if (e) setExpense(e);
  }, [id]);

  const byProject = React.useMemo(() => {
    if (!expense) return new Map<string | null, number>();
    const map = new Map<string | null, number>();
    for (const line of expense.lines) {
      const key = line.projectId;
      map.set(key, (map.get(key) ?? 0) + line.amount);
    }
    return map;
  }, [expense]);

  React.useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  if (notFoundState) notFound();
  if (!expense) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const projects = getProjects();
  const categories = getExpenseCategories();
  const vendorsList = getVendors();
  const paymentMethodsList = getPaymentMethods();
  const total = getExpenseTotal(expense);

  const handleSaveHeader = () => {
    const form = document.querySelector("[data-expense-header-form]") as HTMLFormElement;
    if (!form) return;
    const formData = new FormData(form);
    updateExpense(expense.id, {
      date: (formData.get("date") as string) || expense.date,
      vendorName,
      paymentMethod,
      referenceNo: (formData.get("referenceNo") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
    refresh();
  };

  const handleLineChange = (lineId: string, patch: Partial<ExpenseLine>) => {
    updateExpenseLine(expense.id, lineId, patch);
    refresh();
  };

  const handleAddLine = () => {
    addExpenseLine(expense.id, { projectId: null, category: "Other", amount: 0 });
    refresh();
  };

  const handleDeleteLine = (lineId: string) => {
    deleteExpenseLine(expense.id, lineId);
    refresh();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      const att = makeAttachment(files[i]);
      addExpenseAttachment(expense.id, att);
    }
    e.target.value = "";
    refresh();
  };

  const handleRemoveAttachment = (att: ExpenseAttachment) => {
    if (att.url?.startsWith("blob:")) URL.revokeObjectURL(att.url);
    deleteExpenseAttachment(expense.id, att.id);
    refresh();
  };

  const handleDownload = (att: ExpenseAttachment) => {
    const a = document.createElement("a");
    a.href = att.url;
    a.download = att.fileName;
    a.click();
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

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        {toastMessage && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-4">{toastMessage}</p>
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
                onCreate={(name) => {
                  const toSelect = addVendor(name);
                  if (toSelect) {
                    setVendorName(toSelect);
                    setToastMessage(`Added vendor: ${toSelect}`);
                  }
                }}
              />
              {vendorName && isVendorDisabled(vendorName) && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">Disabled</span>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
              <Input name="date" type="date" defaultValue={expense.date} className="mt-1 rounded-lg" />
            </div>
            <div>
              <CreatableSelect
                label="Payment method"
                value={paymentMethod}
                options={paymentMethodsList}
                placeholder="Payment method"
                onChange={setPaymentMethod}
                onCreate={(name) => {
                  const toSelect = addPaymentMethod(name);
                  if (toSelect) {
                    setPaymentMethod(toSelect);
                    setToastMessage(`Added payment method: ${toSelect}`);
                  }
                }}
              />
              {paymentMethod && isPaymentMethodDisabled(paymentMethod) && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">Disabled</span>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference #</label>
              <Input name="referenceNo" defaultValue={expense.referenceNo ?? ""} className="mt-1 rounded-lg" placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
            <Input name="notes" defaultValue={expense.notes ?? ""} className="mt-1 rounded-lg" placeholder="Optional" />
          </div>
          <Button type="button" onClick={handleSaveHeader}>
            Save header
          </Button>
        </form>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Receipt attachments</h2>
        <p className="text-xs text-muted-foreground mb-2">Attachments are stored locally in this demo.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button variant="outline" size="lg" className="min-h-12" onClick={() => fileInputRef.current?.click()}>
          <Plus className="h-4 w-4 mr-2" />
          Add receipt
        </Button>
        <ul className="mt-3 space-y-2">
          {expense.attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 rounded-xl border border-zinc-200/60 dark:border-border p-3">
              <button
                type="button"
                className="flex items-center gap-3 min-w-0 flex-1 text-left"
                onClick={() => { setPreviewAttachment(att); setPreviewOpen(true); }}
              >
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium truncate">{att.fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{att.size > 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${att.size} B`}</span>
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(att)} aria-label="Download">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveAttachment(att)} aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden p-6">
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
            paymentMethodsList={paymentMethodsList}
            onAddCategory={addExpenseCategory}
            onAddVendor={addVendor}
            onAddPaymentMethod={addPaymentMethod}
            onToast={setToastMessage}
            isExpenseCategoryDisabled={isExpenseCategoryDisabled}
            isVendorDisabled={isVendorDisabled}
            isPaymentMethodDisabled={isPaymentMethodDisabled}
            minLines={1}
          />
        </Card>

        <div className="mt-4 flex flex-col sm:flex-row gap-4">
          <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-muted/20 px-4 py-3 min-w-[200px]">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lines total</p>
            <p className="text-xl font-bold tabular-nums text-red-600/90 dark:text-red-400/90 mt-0.5">${total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-muted/20 px-4 py-3 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Per project</p>
            <ul className="space-y-1 text-sm">
              {Array.from(byProject.entries()).map(([projectId, amount]) => (
                <li key={projectId ?? "overhead"} className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">{projectId == null ? "Overhead" : getProjectById(projectId)?.name ?? projectId}</span>
                  <span>${amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <AttachmentPreviewDialog attachment={previewAttachment} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
