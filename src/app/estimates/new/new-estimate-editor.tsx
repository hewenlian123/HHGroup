"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createEstimateWithItemsAction } from "./actions";
import type { CostCode } from "@/lib/data";
import { Plus, Copy, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyProfile } from "@/lib/company-profile";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";

type CostCodeType = "material" | "labor" | "subcontractor";

type PaymentMilestoneLocal = {
  id: string;
  title: string;
  amountType: "percent" | "fixed";
  value: number;
  dueRule: string;
  dueDate?: string;
  notes?: string;
};

type LineItem = {
  id: string;
  costCode: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  markupPct: number;
};

function lineTotal(li: LineItem): number {
  return li.qty * li.unitPrice * (1 + li.markupPct);
}

export function NewEstimateEditor({ costCodes }: { costCodes: CostCode[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const { toast } = useToast();

  const [clientName, setClientName] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerOption | null>(null);
  const [estimateDate] = React.useState(today);
  const [validUntil, setValidUntil] = React.useState("");
  const [salesPerson, setSalesPerson] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [tax, setTax] = React.useState(0);
  const [taxTouched, setTaxTouched] = React.useState(false);
  const [defaultTaxPct, setDefaultTaxPct] = React.useState(0);
  const [discount, setDiscount] = React.useState(0);
  const [overheadPct, setOverheadPct] = React.useState(5);
  const [profitPct, setProfitPct] = React.useState(10);
  const [categoryNames, setCategoryNames] = React.useState<Record<string, string>>({});
  const [lineItems, setLineItems] = React.useState<LineItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  /** Estimate Information: read-only summary by default; Edit opens the form. */
  const [isEditing, setIsEditing] = React.useState(false);
  const infoSnapshotRef = React.useRef<{
    clientName: string;
    projectName: string;
    address: string;
    phone: string;
    email: string;
    validUntil: string;
    salesPerson: string;
    notes: string;
    selectedCustomer: CustomerOption | null;
  } | null>(null);
  const [paymentMilestones, setPaymentMilestones] = React.useState<PaymentMilestoneLocal[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [pmTitle, setPmTitle] = React.useState("");
  const [pmAmountType, setPmAmountType] = React.useState<"percent" | "fixed">("percent");
  const [pmValue, setPmValue] = React.useState("");
  const [pmDueRule, setPmDueRule] = React.useState("");
  const [pmDueDate, setPmDueDate] = React.useState("");
  const [pmNotes, setPmNotes] = React.useState("");

  const codeToType = React.useMemo(() => {
    const m = new Map<string, CostCodeType>();
    costCodes.forEach((c) => {
      if ("type" in c && (c as { type?: string }).type)
        m.set(c.code, (c as { type: CostCodeType }).type);
    });
    return m;
  }, [costCodes]);

  const itemsByCode = React.useMemo(() => {
    const acc: Record<string, LineItem[]> = {};
    lineItems.forEach((li) => {
      if (!acc[li.costCode]) acc[li.costCode] = [];
      acc[li.costCode].push(li);
    });
    return acc;
  }, [lineItems]);

  const summary = React.useMemo(() => {
    let materialCost = 0,
      laborCost = 0,
      subcontractorCost = 0;
    lineItems.forEach((li) => {
      const t = codeToType.get(li.costCode);
      const tot = lineTotal(li);
      if (t === "material") materialCost += tot;
      else if (t === "labor") laborCost += tot;
      else if (t === "subcontractor") subcontractorCost += tot;
    });
    const subtotal = lineItems.reduce((s, li) => s + lineTotal(li), 0);
    const overhead = subtotal * (overheadPct / 100);
    const profit = subtotal * (profitPct / 100);
    const grandTotal = subtotal + overhead + profit + tax - discount;
    return {
      materialCost,
      laborCost,
      subcontractorCost,
      subtotal,
      overhead,
      profit,
      tax,
      discount,
      grandTotal,
    };
  }, [lineItems, codeToType, overheadPct, profitPct, tax, discount]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const loadCompanyTaxDefaults = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (Number.isFinite(pct) && pct >= 0) setDefaultTaxPct(pct);
    } catch {
      // ignore
    }
  }, [supabase]);

  React.useEffect(() => {
    void loadCompanyTaxDefaults();
  }, [loadCompanyTaxDefaults]);

  useOnAppSync(
    React.useCallback(() => {
      void loadCompanyTaxDefaults();
    }, [loadCompanyTaxDefaults]),
    [loadCompanyTaxDefaults]
  );

  React.useEffect(() => {
    if (taxTouched) return;
    const pct = Math.max(0, Number(defaultTaxPct) || 0);
    if (!(pct > 0)) {
      if (tax !== 0) setTax(0);
      return;
    }
    const computed = summary.subtotal * (pct / 100);
    if (Number.isFinite(computed)) setTax(Number(computed.toFixed(2)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTaxPct, summary.subtotal, taxTouched]);

  const addLineItem = (costCode: string) => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        costCode,
        title: "",
        description: "",
        qty: 1,
        unit: "EA",
        unitPrice: 0,
        markupPct: 0.1,
      },
    ]);
  };

  const addCategory = () => {
    const used = new Set(lineItems.map((li) => li.costCode));
    const first = costCodes.find((c) => !used.has(c.code));
    if (first) addLineItem(first.code);
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, ...patch } : li)));
  };

  const duplicateItem = (id: string) => {
    const src = lineItems.find((li) => li.id === id);
    if (!src) return;
    setLineItems((prev) => [
      ...prev,
      {
        ...src,
        id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: src.title ? `${src.title} (copy)` : "Copy",
      },
    ]);
  };

  const deleteItem = (id: string) => {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  const setCategoryName = (code: string, name: string) => {
    setCategoryNames((prev) => ({ ...prev, [code]: name }));
  };

  const applyCustomerSelection = React.useCallback((customer: CustomerOption) => {
    setSelectedCustomer(customer);
    setClientName(customer.name ?? "");
    setAddress((prev) => (!prev.trim() ? (customer.address ?? "") : prev));
    setPhone((prev) => (!prev.trim() ? (customer.phone ?? "") : prev));
    setEmail((prev) => (!prev.trim() ? (customer.email ?? "") : prev));
  }, []);

  const handleCustomerPickerChange = React.useCallback(
    (customerId: string | null, customer?: CustomerOption | null) => {
      if (!customerId || !customer) {
        setSelectedCustomer(null);
        return;
      }
      applyCustomerSelection(customer);
    },
    [applyCustomerSelection]
  );

  const beginEstimateInfoEdit = () => {
    infoSnapshotRef.current = {
      clientName,
      projectName,
      address,
      phone,
      email,
      validUntil,
      salesPerson,
      notes,
      selectedCustomer: selectedCustomer ? { ...selectedCustomer } : null,
    };
    setIsEditing(true);
  };

  const cancelEstimateInfoEdit = () => {
    const snap = infoSnapshotRef.current;
    if (snap) {
      setClientName(snap.clientName);
      setProjectName(snap.projectName);
      setAddress(snap.address);
      setPhone(snap.phone);
      setEmail(snap.email);
      setValidUntil(snap.validUntil);
      setSalesPerson(snap.salesPerson);
      setNotes(snap.notes);
      setSelectedCustomer(snap.selectedCustomer);
    }
    infoSnapshotRef.current = null;
    setIsEditing(false);
  };

  const handleSave = async () => {
    const client = clientName.trim();
    if (!client) {
      toast({ title: "Missing client", description: "Client name is required", variant: "error" });
      return;
    }
    const project = projectName.trim();
    if (!project) {
      toast({
        title: "Missing project",
        description: "Project name is required",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await createEstimateWithItemsAction({
        clientName,
        projectName,
        address,
        clientPhone: phone,
        clientEmail: email,
        estimateDate: estimateDate || undefined,
        validUntil: validUntil || undefined,
        notes: notes.trim() || undefined,
        salesPerson: salesPerson.trim() || undefined,
        tax,
        discount,
        overheadPct: overheadPct / 100,
        profitPct: profitPct / 100,
        costCategoryNames: Object.keys(categoryNames).length ? categoryNames : undefined,
        items: lineItems.map((li) => ({
          costCode: li.costCode,
          desc: li.description ? `${li.title}\n${li.description}` : li.title || "Line item",
          qty: li.qty,
          unit: li.unit,
          unitCost: li.unitPrice,
          markupPct: li.markupPct,
        })),
        paymentSchedule: paymentMilestones.length
          ? paymentMilestones.map((m) => ({
              title: m.title,
              amountType: m.amountType,
              value: m.value,
              dueRule: m.dueRule,
              dueDate: m.dueDate || null,
              notes: m.notes ?? null,
            }))
          : undefined,
      });
      if (!res.ok || !res.estimateId) {
        toast({ title: "Create failed", description: res.error ?? "操作失败", variant: "error" });
        return;
      }
      setIsEditing(false);
      infoSnapshotRef.current = null;
      toast({ title: "Created", description: "Estimate created.", variant: "success" });
      router.push(`/estimates/${res.estimateId}?created=1`);
    } finally {
      setSaving(false);
    }
  };

  const codesWithItems = Object.keys(itemsByCode);
  const codesWithoutItems = costCodes.filter((c) => !itemsByCode[c.code]);
  const totalScheduled = paymentMilestones.reduce(
    (sum, m) => sum + (m.amountType === "percent" ? (summary.grandTotal * m.value) / 100 : m.value),
    0
  );
  const remaining = Math.max(0, summary.grandTotal - totalScheduled);
  const resetPaymentDraft = () => {
    setPmTitle("");
    setPmAmountType("percent");
    setPmValue("");
    setPmDueRule("");
    setPmDueDate("");
    setPmNotes("");
  };
  const addPaymentMilestoneLocal = () => {
    const title = pmTitle.trim();
    if (!title) return;
    const value = Number(pmValue) || 0;
    setPaymentMilestones((prev) => [
      ...prev,
      {
        id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        amountType: pmAmountType,
        value,
        dueRule: pmDueRule.trim(),
        dueDate: pmDueDate || undefined,
        notes: pmNotes.trim() || undefined,
      },
    ]);
    setScheduleOpen(false);
    resetPaymentDraft();
  };

  return (
    <div className="space-y-6">
      {/* A. Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-border pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="btn-outline-ghost rounded-md h-8">
            <Link href="/estimates">Back</Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">New Estimate</h1>
        </div>
      </header>

      {/* B. Compact Estimate Information */}
      <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background transition-all duration-200 ease-in-out">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200/60 dark:border-border bg-muted/20">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Estimate Information</h2>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {clientName || "Client"} • {projectName || "Project"} • Draft
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-md h-8"
                  onClick={cancelEstimateInfoEdit}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="rounded-md h-8"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="btn-outline-ghost rounded-md h-8 text-muted-foreground hover:text-foreground"
                onClick={beginEstimateInfoEdit}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Client
            </div>
            <div className="truncate font-medium text-foreground">{clientName || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Project
            </div>
            <div className="truncate font-medium text-foreground">{projectName || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Estimate #
            </div>
            <div className="truncate font-medium text-foreground tabular-nums">Auto-generated</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </div>
            <div className="truncate font-medium text-foreground">Draft</div>
          </div>
          <div className="min-w-0 md:col-span-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Address
            </div>
            <div className="truncate text-muted-foreground">{address || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Phone
            </div>
            <div className="truncate text-muted-foreground">{phone || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Email
            </div>
            <div className="truncate text-muted-foreground">{email || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Estimate Date
            </div>
            <div className="tabular-nums text-muted-foreground">{estimateDate}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Valid Until
            </div>
            <div className="tabular-nums text-muted-foreground">{validUntil || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Sales
            </div>
            <div className="truncate text-muted-foreground">{salesPerson || "—"}</div>
          </div>
          <div className="min-w-0 md:col-span-2 lg:col-span-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Notes
            </div>
            <div className="truncate text-muted-foreground">{notes || "—"}</div>
          </div>
        </div>

        {isEditing && (
          <div className="p-4 pt-0 space-y-4 border-t border-zinc-200/60 dark:border-border animate-in fade-in-0 transition-all duration-200 ease-in-out">
            <div className="border-b border-zinc-200/60 dark:border-border pb-4">
              <CustomerSelectWithAdd
                label="Select customer"
                value={selectedCustomer?.id ?? null}
                onChange={handleCustomerPickerChange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="clientName" className="text-xs">
                  Client / Customer
                </Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client or company name"
                  className="h-8 rounded-md text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projectName" className="text-xs">
                  Project
                </Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project name"
                  className="h-8 rounded-md text-sm"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-zinc-200/60 dark:border-border">
              <Label htmlFor="address" className="text-xs">
                Address
              </Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Site or client address"
                className="h-8 rounded-md text-sm"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
              <div className="space-y-1.5">
                <Label htmlFor="clientPhone" className="text-xs">
                  Phone
                </Label>
                <Input
                  id="clientPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone"
                  className="h-8 rounded-md text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clientEmail" className="text-xs">
                  Email
                </Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="h-8 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
              <div className="space-y-1.5">
                <Label className="text-xs">Estimate Number</Label>
                <Input
                  placeholder="Auto-generated"
                  className="h-8 rounded-md text-sm bg-muted/50"
                  disabled
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estimate Date</Label>
                <Input
                  type="date"
                  value={estimateDate}
                  className="h-8 rounded-md text-sm"
                  readOnly
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valid Until</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="h-8 rounded-md text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Input value="Draft" className="h-8 rounded-md text-sm bg-muted/50" readOnly />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
              <div className="space-y-1.5">
                <Label className="text-xs">Sales Person</Label>
                <Input
                  value={salesPerson}
                  onChange={(e) => setSalesPerson(e.target.value)}
                  placeholder="Optional"
                  className="h-8 rounded-md text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="h-8 rounded-md text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* C. Cost Breakdown */}
      <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
        <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-border bg-muted/20 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Cost Breakdown</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md h-8"
            onClick={addCategory}
            disabled={codesWithoutItems.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>
        <div className="divide-y divide-zinc-200/60 dark:divide-border">
          {codesWithItems.map((code) => {
            const cc = costCodes.find((c) => c.code === code)!;
            const displayName = categoryNames[code] ?? cc.name;
            const rows = itemsByCode[code];
            const sectionSubtotal = rows.reduce((s, li) => s + lineTotal(li), 0);
            return (
              <details key={code} className="group" open>
                <summary className="flex list-none flex-wrap items-center justify-between gap-2 cursor-pointer px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform shrink-0" />
                    <Input
                      value={displayName}
                      onChange={(e) => setCategoryName(code, e.target.value)}
                      className="h-7 font-medium text-sm bg-transparent border-0 shadow-none focus-visible:ring-1 max-w-[240px]"
                      placeholder={cc.name}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <span className="tabular-nums text-sm font-medium text-foreground">
                    ${sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </summary>
                <div className="border-t border-zinc-200/60 dark:border-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                          <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            Title
                          </th>
                          <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-20">
                            Qty
                          </th>
                          <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium w-16">
                            Unit
                          </th>
                          <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-28">
                            Unit Price
                          </th>
                          <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium w-20">
                            Cost Code
                          </th>
                          <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums w-28">
                            Total
                          </th>
                          <th className="w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <React.Fragment key={row.id}>
                            <tr className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors">
                              <td className="py-2 px-4 align-top">
                                <Input
                                  value={row.title}
                                  onChange={(e) => updateItem(row.id, { title: e.target.value })}
                                  className="h-8 text-sm"
                                  placeholder="Title"
                                />
                              </td>
                              <td className="py-2 px-4 align-top">
                                <Input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={row.qty}
                                  onChange={(e) =>
                                    updateItem(row.id, { qty: Number(e.target.value) || 0 })
                                  }
                                  className="h-8 w-20 text-right"
                                />
                              </td>
                              <td className="py-2 px-4 align-top">
                                <Input
                                  value={row.unit}
                                  onChange={(e) => updateItem(row.id, { unit: e.target.value })}
                                  className="h-8 w-16"
                                />
                              </td>
                              <td className="py-2 px-4 align-top">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={row.unitPrice}
                                  onChange={(e) =>
                                    updateItem(row.id, { unitPrice: Number(e.target.value) || 0 })
                                  }
                                  className="h-8 w-28 text-right"
                                />
                              </td>
                              <td className="py-2 px-4 align-top text-muted-foreground text-xs">
                                {row.costCode}
                              </td>
                              <td className="py-2 px-4 align-top text-right tabular-nums font-semibold">
                                $
                                {lineTotal(row).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-2 px-2 align-top">
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="btn-outline-ghost h-8 w-8"
                                    onClick={() => duplicateItem(row.id)}
                                    title="Duplicate"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="btn-outline-ghost h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteItem(row.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-zinc-50/30 dark:bg-zinc-900/20">
                              <td colSpan={7} className="py-1.5 px-4 align-top">
                                <AutoExpandTextarea
                                  value={row.description}
                                  onChange={(v) => updateItem(row.id, { description: v })}
                                  placeholder="Description (optional)"
                                  className="min-h-[52px] w-full resize-none rounded-md border-0 bg-transparent py-1.5 px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 border-t border-zinc-100/50 dark:border-border/30">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="btn-outline-ghost h-8 text-muted-foreground hover:text-foreground"
                      onClick={() => addLineItem(code)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Line Item
                    </Button>
                  </div>
                </div>
              </details>
            );
          })}

          {codesWithItems.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">No categories or line items yet.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md h-8"
                onClick={addCategory}
                disabled={costCodes.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* D. Payment Schedule */}
      <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
        <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-border bg-muted/20 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Payment Schedule</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md h-8"
            onClick={() => setScheduleOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Schedule Payment
          </Button>
        </div>
        <div className="px-4 py-3 flex flex-wrap items-center gap-6 text-sm border-b border-zinc-200/60 dark:border-border">
          <span className="text-muted-foreground">
            Estimate total{" "}
            <span className="font-semibold text-foreground tabular-nums">
              ${summary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span className="text-muted-foreground">
            Scheduled{" "}
            <span className="font-semibold text-foreground tabular-nums">
              ${totalScheduled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </span>
          <span className="text-muted-foreground">
            Remaining{" "}
            <span className="font-semibold text-foreground tabular-nums">
              ${remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Payment Name
                </th>
                <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                  Amount
                </th>
                <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Payment Terms
                </th>
                <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Due Date
                </th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {paymentMilestones.length === 0 ? (
                <tr className="border-b border-zinc-100/50 dark:border-border/30">
                  <td colSpan={5} className="py-8 px-4 text-center text-sm text-muted-foreground">
                    No payment milestones yet.
                  </td>
                </tr>
              ) : (
                paymentMilestones.map((m) => {
                  const amount =
                    m.amountType === "percent" ? (summary.grandTotal * m.value) / 100 : m.value;
                  return (
                    <tr
                      key={m.id}
                      className="table-row-compact border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-2 px-4 font-medium text-foreground">{m.title}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-medium text-foreground">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{m.dueRule || "—"}</td>
                      <td className="py-2 px-4 text-muted-foreground tabular-nums">
                        {m.dueDate || "—"}
                      </td>
                      <td className="py-2 px-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="btn-outline-ghost h-8 w-8 text-destructive"
                          onClick={() =>
                            setPaymentMilestones((prev) => prev.filter((x) => x.id !== m.id))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Sheet
          open={scheduleOpen}
          onOpenChange={(open) => {
            setScheduleOpen(open);
            if (!open) resetPaymentDraft();
          }}
        >
          <SheetContent side="right" className="w-[420px] sm:w-[480px]">
            <SheetHeader>
              <SheetTitle>Schedule Payment</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <Label htmlFor="pm-title" className="text-xs">
                  Payment Name
                </Label>
                <Input
                  id="pm-title"
                  value={pmTitle}
                  onChange={(e) => setPmTitle(e.target.value)}
                  placeholder="e.g. Deposit"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <div className="flex gap-2">
                  <select
                    value={pmAmountType}
                    onChange={(e) => setPmAmountType(e.target.value as "percent" | "fixed")}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="percent">Percent</option>
                  </select>
                  <Input
                    value={pmValue}
                    onChange={(e) => setPmValue(e.target.value)}
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={pmAmountType === "percent" ? "30" : "2500"}
                    className="h-9 w-28 text-right"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm-terms" className="text-xs">
                  Payment Terms
                </Label>
                <Input
                  id="pm-terms"
                  value={pmDueRule}
                  onChange={(e) => setPmDueRule(e.target.value)}
                  placeholder="e.g. Due on signing"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm-dueDate" className="text-xs">
                  Due Date
                </Label>
                <Input
                  id="pm-dueDate"
                  value={pmDueDate}
                  onChange={(e) => setPmDueDate(e.target.value)}
                  type="date"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm-notes" className="text-xs">
                  Notes
                </Label>
                <textarea
                  id="pm-notes"
                  value={pmNotes}
                  onChange={(e) => setPmNotes(e.target.value)}
                  placeholder="Optional"
                  className="min-h-[96px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button type="button" className="rounded-md" onClick={addPaymentMilestoneLocal}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-md"
                  onClick={() => {
                    setScheduleOpen(false);
                    resetPaymentDraft();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </section>

      {/* E. Summary (bottom totals block) */}
      <section className="border border-zinc-200/70 dark:border-border rounded-lg overflow-hidden bg-background">
        <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-border bg-muted/20">
          <h2 className="text-sm font-semibold text-foreground">Estimate Summary</h2>
        </div>
        <div className="p-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-2 text-sm">
            <SummaryRow label="Material Cost" value={summary.materialCost} />
            <SummaryRow label="Labor Cost" value={summary.laborCost} />
            <SummaryRow label="Subcontractor Cost" value={summary.subcontractorCost} />
          </div>
          <div className="space-y-2 text-sm">
            <SummaryRow label="Subtotal" value={summary.subtotal} />
            <div className="flex justify-between items-center text-sm">
              <Label htmlFor="summary-tax" className="text-muted-foreground">
                Tax ($)
              </Label>
              <Input
                id="summary-tax"
                type="number"
                step={0.01}
                value={tax}
                onChange={(e) => {
                  setTaxTouched(true);
                  setTax(Number(e.target.value) || 0);
                }}
                className="h-8 w-28 text-right"
              />
            </div>
            <div className="flex justify-between items-center text-sm">
              <Label htmlFor="summary-discount" className="text-muted-foreground">
                Discount ($)
              </Label>
              <Input
                id="summary-discount"
                type="number"
                step={0.01}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="h-8 w-28 text-right"
              />
            </div>
            <div className="flex justify-between items-center text-sm">
              <Label htmlFor="summary-markup" className="text-muted-foreground">
                Markup (%)
              </Label>
              <Input
                id="summary-markup"
                type="number"
                step={0.1}
                value={overheadPct + profitPct}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setOverheadPct(v / 2);
                  setProfitPct(v / 2);
                }}
                className="h-8 w-28 text-right"
              />
            </div>
            <div className="flex justify-between items-center pt-3 mt-2 border-t border-zinc-200/60 dark:border-border">
              <span className="font-semibold text-foreground">Total</span>
              <span className="tabular-nums font-semibold text-foreground">
                ${summary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* F. Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="rounded-md h-9 px-4">
          {saving ? "Saving…" : "Save Estimate"}
        </Button>
        <Button type="button" variant="outline" asChild className="rounded-md h-9 px-4">
          <Link href="/estimates">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">
        ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}

function AutoExpandTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.max(52, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      rows={2}
    />
  );
}
