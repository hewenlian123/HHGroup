"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useToast } from "@/components/toast/toast-provider";
import {
  createExpense,
  getProjects,
  getExpenseCategories,
  getVendors,
  addVendor,
  getAccounts,
  updateExpenseReceiptUrl,
} from "@/lib/data";
import { createBrowserClient } from "@/lib/supabase";

type ProjectOption = { id: string; name: string | null };

type LineForm = {
  id: string;
  projectId: string | null;
  category: string;
  memo: string;
  amount: string;
};

function newLine(): LineForm {
  return { id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, projectId: null, category: "Other", memo: "", amount: "" };
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
  const [categories, setCategories] = React.useState<string[]>([]);
  const [vendors, setVendors] = React.useState<string[]>([]);

  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [vendorName, setVendorName] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineForm[]>([newLine()]);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);

  const [accounts, setAccounts] = React.useState<Array<{ id: string; name: string; type: string; lastFour: string | null }>>([]);

  const supabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, c, v, accs] = await Promise.all([
          getProjects(),
          getExpenseCategories(),
          getVendors(),
          getAccounts().catch(() => []),
        ]);
        if (cancelled) return;
        setProjects(p as unknown as ProjectOption[]);
        setCategories(c);
        setVendors(v);
        setAccounts(accs);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load lookups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const total = React.useMemo(() => lines.reduce((s, l) => s + safeAmount(l.amount), 0), [lines]);

  const validate = (): boolean => {
    const v = vendorName.trim();
    if (!v) {
      toast({ title: "Missing vendor", description: "Vendor name is required.", variant: "error" });
      return false;
    }
    const amount = parseCurrency(amountInput);
    if (!(amount > 0)) {
      toast({ title: "Missing amount", description: "Amount must be greater than 0.", variant: "error" });
      return false;
    }
    if (!(total > 0)) {
      toast({ title: "Missing split lines", description: "At least one split line amount is required.", variant: "error" });
      return false;
    }
    if (Math.round(amount * 100) !== Math.round(total * 100)) {
      toast({
        title: "Amounts do not match",
        description: "Total of split lines must match the Amount field.",
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
        paymentMethod: "Other",
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        accountId: accountId || undefined,
        lines: lines.map((l) => ({
          projectId: l.projectId,
          category: (l.category || "Other").trim() || "Other",
          memo: l.memo.trim() || null,
          amount: safeAmount(l.amount),
        })),
      });
      if (receiptFile && supabase) {
        const path = `receipts/${created.id}/${receiptFile.name}`;
        const { error: uploadError } = await supabase.storage.from("receipts").upload(path, receiptFile, {
          contentType: receiptFile.type || "application/octet-stream",
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);
        const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
        await updateExpenseReceiptUrl(created.id, urlData.publicUrl);
      }
      toast({ title: "Created", description: "Expense created.", variant: "success" });
      router.push(`/financial/expenses/${created.id}`);
      router.refresh();
    } catch (e2: unknown) {
      const msg = e2 instanceof Error ? e2.message : "Failed to create expense.";
      setError(msg);
      toast({ title: "Create failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container page-stack flex justify-center px-8 py-8">
      <div className="w-full max-w-3xl space-y-7">
        <PageHeader
          title="New Expense"
          description="Create an expense and split it across projects."
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <form onSubmit={onSubmit} className="space-y-7">
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-foreground">Expense details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendor</label>
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                <div className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5">
                  <span className="text-sm font-medium text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="h-7 w-full bg-transparent text-base outline-none"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment source</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">Select payment source</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.lastFour ? `${acc.name} •••• ${acc.lastFour}` : acc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reference #</label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="h-9" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" placeholder="Optional" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Receipt</h2>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
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
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Drag receipt here</span>
              <span className="mt-1 text-sm text-foreground">or click to upload</span>
              <span className="mt-1 text-xs text-muted-foreground">Supported formats: JPG, PNG, PDF</span>
              {receiptFile ? (
                <span className="mt-2 text-xs text-foreground">Selected: {receiptFile.name}</span>
              ) : null}
            </label>
          </section>

          <section className="space-y-3">
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
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, memo: e.target.value } : x)))}
                    className="h-9"
                    placeholder="Memo / description"
                  />
                  <select
                    value={l.projectId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, projectId: v } : x)));
                    }}
                    className="h-9 rounded border border-input bg-transparent px-2 text-xs"
                    disabled={loading}
                  >
                    <option value="">Overhead</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.id}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.category}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, category: e.target.value } : x)))}
                    className="h-9 rounded border border-input bg-transparent px-2 text-xs"
                    disabled={loading}
                  >
                    {Array.from(new Set(["Other", ...categories])).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.amount}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, amount: e.target.value } : x)))}
                    className="h-9 tabular-nums"
                    placeholder="0.00"
                    required={idx === 0}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.id !== l.id)))}
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

          <section className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => router.push("/financial/expenses")}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8" disabled={saving}>
              {saving ? "Creating…" : "Create Expense"}
            </Button>
          </section>
        </form>
      </div>
    </div>
  );
}

