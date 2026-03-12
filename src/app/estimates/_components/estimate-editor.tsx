"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CostCode, EstimateItemRow, EstimateMetaRecord, EstimateSummaryResult, PaymentScheduleItem, PaymentScheduleTemplate } from "@/lib/data";
import { estimateLineTotal } from "@/lib/data";
import { EstimateSummarySidebar } from "../[id]/estimate-summary-sidebar";
import { saveEstimateMetaAction, addLineItemAction, updateLineItemAction, deleteLineItemAction, duplicateLineItemAction, saveCostCategoryNameAction, addPaymentMilestoneAction, updatePaymentMilestoneAction, deletePaymentMilestoneAction, markPaymentMilestonePaidAction, reorderPaymentScheduleAction, applyPaymentTemplateAction, createPaymentTemplateAction } from "../[id]/actions";
import { ChevronRight, ChevronDown, Plus, Copy, Trash2 } from "lucide-react";
import { EstimateStatusBadge } from "./estimate-status-badge";
import { EstimatePaymentSchedule } from "./estimate-payment-schedule";

export type EstimateEditorProps = {
  estimateId: string;
  estimateNumber: string;
  status: string;
  meta: EstimateMetaRecord;
  items: EstimateItemRow[];
  categoryNames: Record<string, string>;
  costCodes: CostCode[];
  summary: EstimateSummaryResult | null;
  paymentSchedule: PaymentScheduleItem[];
  paymentTemplates?: PaymentScheduleTemplate[];
  /** When true, enable editing in the editor UI. */
  editing?: boolean;
  /** On /estimates/[id], false so Cost Breakdown stays higher after save. */
  defaultInfoExpanded?: boolean;
};

export function EstimateEditor({ estimateId, estimateNumber, status, meta, items, categoryNames, costCodes, summary, paymentSchedule = [], paymentTemplates = [], editing = false, defaultInfoExpanded = false }: EstimateEditorProps) {
  const [infoOpen, setInfoOpen] = React.useState(defaultInfoExpanded);
  const isLocked = !["Draft", "Sent"].includes(status);
  const isReadOnly = isLocked || !editing;
  const today = new Date().toISOString().slice(0, 10);

  const itemsByCode = React.useMemo(() => {
    const acc: Record<string, EstimateItemRow[]> = {};
    costCodes.forEach((cc) => {
      const rows = items.filter((i) => i.costCode === cc.code);
      if (rows.length > 0) acc[cc.code] = rows;
    });
    return acc;
  }, [items, costCodes]);

  const markupPct = ((meta.overheadPct + meta.profitPct) * 100).toFixed(1);

  return (
    <React.Fragment>
      <div className="space-y-6">
        {/* Info bar + details */}
        <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden bg-background">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-200 dark:border-border bg-muted/20">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Client / Project</h2>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {meta.client.name} • {meta.project.name}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-md h-8 text-muted-foreground hover:text-foreground"
              onClick={() => setInfoOpen(!infoOpen)}
            >
              {infoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {infoOpen ? "Hide details" : "Edit details"}
            </Button>
          </div>
          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Client</div>
              <div className="truncate font-medium text-foreground">{meta.client.name || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Project</div>
              <div className="truncate font-medium text-foreground">{meta.project.name || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Estimate #</div>
              <div className="truncate font-medium text-foreground tabular-nums">{estimateNumber}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Status</div>
              <div className="pt-0.5">
                <EstimateStatusBadge status={status === "Converted" ? "Converted" : status} label={status === "Converted" ? "Converted to Project" : undefined} className="text-xs" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Address</div>
              <div className="truncate text-muted-foreground">{meta.client.address || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Estimate Date</div>
              <div className="tabular-nums text-muted-foreground">{meta.estimateDate ?? today}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Valid Until</div>
              <div className="tabular-nums text-muted-foreground">{meta.validUntil ?? "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Sales</div>
              <div className="truncate text-muted-foreground">{meta.salesPerson ?? "—"}</div>
            </div>
          </div>

          {infoOpen && (
            <form id="estimate-meta-form" action={saveEstimateMetaAction} className="p-4 pt-0 space-y-4">
              <input type="hidden" name="estimateId" value={estimateId} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clientName" className="text-xs">Client / Customer</Label>
                  <Input id="clientName" name="clientName" defaultValue={meta.client.name} placeholder="Client or company name" className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="projectName" className="text-xs">Project</Label>
                  <Input id="projectName" name="projectName" defaultValue={meta.project.name} placeholder="Project name" className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-border">
                <Label htmlFor="address" className="text-xs">Address</Label>
                <Input id="address" name="address" defaultValue={meta.client.address} placeholder="Site or client address" className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-border">
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimate Number</Label>
                  <Input value={estimateNumber} className="h-8 rounded-md text-sm bg-muted/50" readOnly />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="estimateDate" className="text-xs">Estimate Date</Label>
                  <Input id="estimateDate" name="estimateDate" type="date" defaultValue={meta.estimateDate ?? today} className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validUntil" className="text-xs">Valid Until</Label>
                  <Input id="validUntil" name="validUntil" type="date" defaultValue={meta.validUntil ?? ""} className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-border">
                <div className="space-y-1.5">
                  <Label htmlFor="salesPerson" className="text-xs">Sales Person</Label>
                  <Input id="salesPerson" name="salesPerson" defaultValue={meta.salesPerson ?? ""} placeholder="Optional" className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">Notes</Label>
                  <Input id="notes" name="notes" defaultValue={meta.notes ?? ""} placeholder="Optional notes" className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                </div>
              </div>
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-200 dark:border-border">
                  <div className="space-y-1.5">
                    <Label htmlFor="tax" className="text-xs">Tax ($)</Label>
                    <Input id="tax" name="tax" type="number" step="0.01" defaultValue={summary.tax} className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="discount" className="text-xs">Discount ($)</Label>
                    <Input id="discount" name="discount" type="number" step="0.01" defaultValue={summary.discount} className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="markupPct" className="text-xs">Markup (%)</Label>
                    <Input id="markupPct" name="markupPct" type="number" step="0.1" defaultValue={markupPct} className="h-8 rounded-md text-sm" readOnly={isReadOnly} />
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

      {/* Cost Breakdown — full width table */}
      <div className="border border-zinc-200 dark:border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-border bg-muted/20">
            <h2 className="text-sm font-semibold text-foreground">Cost Breakdown</h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-border">
              {Object.entries(itemsByCode).map(([code, rows]) => {
                const cc = costCodes.find((c) => c.code === code)!;
                const displayName = categoryNames[code] ?? cc.name;
                const sectionSubtotal = rows.reduce((s, r) => s + estimateLineTotal(r), 0);
                return (
                  <details key={code} className="group" open>
                    <summary className="flex list-none flex-wrap items-center justify-between gap-2 cursor-pointer px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform shrink-0" />
                        {isReadOnly ? (
                          <span className="font-medium text-foreground text-sm">{code} – {displayName}</span>
                        ) : (
                          <form action={saveCostCategoryNameAction} className="flex-1 min-w-0 inline" onClick={(e) => e.stopPropagation()}>
                            <input type="hidden" name="estimateId" value={estimateId} />
                            <input type="hidden" name="costCode" value={code} />
                            <Input name="displayName" defaultValue={displayName} className="h-7 font-medium text-sm bg-transparent border-0 shadow-none focus-visible:ring-1 max-w-[200px]" placeholder={code} />
                          </form>
                        )}
                      </div>
                      <span className="tabular-nums text-sm font-medium text-foreground">
                        ${sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </summary>
                    <div className="border-t border-zinc-200 dark:border-border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-border bg-muted/10">
                              <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Title</th>
                              <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Qty</th>
                              <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Unit</th>
                              <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Unit Price</th>
                              <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Cost Code</th>
                              <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Total</th>
                              {!isReadOnly && <th className="w-20" />}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <LineItemRow
                                key={row.id}
                                row={row}
                                estimateId={estimateId}
                                code={cc}
                                isLocked={isReadOnly}
                                updateLineItemAction={updateLineItemAction}
                                duplicateLineItemAction={duplicateLineItemAction}
                                deleteLineItemAction={deleteLineItemAction}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!isReadOnly && (
                        <div className="px-4 py-2 border-t border-zinc-100 dark:border-border/50">
                          <form action={addLineItemAction} className="inline-block">
                            <input type="hidden" name="estimateId" value={estimateId} />
                            <input type="hidden" name="costCode" value={code} />
                            <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs rounded-md border border-dashed border-zinc-300 dark:border-border text-muted-foreground hover:text-foreground">
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Add line item
                            </Button>
                          </form>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
              {!isReadOnly && (
                <AddCategoryBlock estimateId={estimateId} costCodes={costCodes} itemsByCode={itemsByCode} addLineItemAction={addLineItemAction} />
              )}
          </div>
      </div>

      {/* Payment Schedule — full width */}
      <EstimatePaymentSchedule
          estimateId={estimateId}
          paymentSchedule={paymentSchedule}
          estimateTotal={summary?.grandTotal ?? 0}
          isLocked={isReadOnly}
          paymentTemplates={paymentTemplates}
          addPaymentMilestoneAction={addPaymentMilestoneAction}
          updatePaymentMilestoneAction={updatePaymentMilestoneAction}
          deletePaymentMilestoneAction={deletePaymentMilestoneAction}
          markPaymentMilestonePaidAction={markPaymentMilestonePaidAction}
          reorderPaymentScheduleAction={reorderPaymentScheduleAction}
          applyPaymentTemplateAction={applyPaymentTemplateAction}
          createPaymentTemplateAction={createPaymentTemplateAction}
      />

      {/* Estimate Summary — totals block at bottom */}
      <EstimateSummarySidebar summary={summary} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild className="rounded-md h-8">
          <Link href="/estimates">Back to list</Link>
        </Button>
      </div>
    </div>
    </React.Fragment>
  );
}

function LineItemRow({
  row,
  estimateId,
  code,
  isLocked,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
}: {
  row: EstimateItemRow;
  estimateId: string;
  code: CostCode;
  isLocked: boolean;
  updateLineItemAction: (fd: FormData) => Promise<void>;
  duplicateLineItemAction: (fd: FormData) => Promise<void>;
  deleteLineItemAction: (fd: FormData) => Promise<void>;
}) {
  const [title, setTitle] = React.useState(() => {
    const i = row.desc.indexOf("\n");
    return i < 0 ? row.desc : row.desc.slice(0, i);
  });
  const [desc, setDesc] = React.useState(() => {
    const i = row.desc.indexOf("\n");
    return i < 0 ? "" : row.desc.slice(i + 1);
  });
  const [qty, setQty] = React.useState(row.qty);
  const [unit, setUnit] = React.useState(row.unit);
  const [unitCost, setUnitCost] = React.useState(row.unitCost);
  const combinedDesc = desc.trim() ? `${title}\n${desc}` : title;
  const formId = `line-${row.id}`;

  return (
    <>
      <tr className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors">
        <td className="py-2 px-4 align-top">
          {isLocked ? <span className="font-medium">{title || row.desc}</span> : (
            <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()} className="h-8 text-sm" placeholder="Title" />
          )}
        </td>
        <td className="py-2 px-4 text-right align-top">
          {isLocked ? row.qty : (
            <Input form={formId} type="number" name="qty" step="1" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()} className="h-8 w-16 text-right" />
          )}
        </td>
        <td className="py-2 px-4 align-top">
          {isLocked ? row.unit : <Input form={formId} name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()} className="h-8 w-14" />}
        </td>
        <td className="py-2 px-4 text-right align-top">
          {isLocked ? `$${row.unitCost.toLocaleString()}` : (
            <Input form={formId} type="number" name="unitCost" step="0.01" value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value) || 0)} onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()} className="h-8 w-20 text-right" />
          )}
        </td>
        <td className="py-2 px-4 align-top text-muted-foreground text-xs">{code.code}</td>
        <td className="py-2 px-4 align-top text-right tabular-nums font-semibold">${estimateLineTotal(row).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        {!isLocked && (
          <td className="py-2 px-2 align-top">
            <form action={duplicateLineItemAction} className="inline">
              <input type="hidden" name="estimateId" value={estimateId} />
              <input type="hidden" name="itemId" value={row.id} />
              <Button type="submit" variant="ghost" size="icon" className="h-8 w-8"><Copy className="h-4 w-4" /></Button>
            </form>
            <form action={deleteLineItemAction} className="inline">
              <input type="hidden" name="estimateId" value={estimateId} />
              <input type="hidden" name="itemId" value={row.id} />
              <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </form>
          </td>
        )}
      </tr>
      <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-zinc-50/30 dark:bg-zinc-900/20">
        <td colSpan={isLocked ? 6 : 7} className="py-1.5 px-4 align-top">
          {isLocked ? (desc ? <span className="text-sm text-muted-foreground">{desc}</span> : null) : (
            <>
              <form id={formId} action={updateLineItemAction} className="hidden">
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <input type="hidden" name="desc" value={combinedDesc} />
                <input type="hidden" name="qty" value={qty} />
                <input type="hidden" name="unit" value={unit} />
                <input type="hidden" name="unitCost" value={unitCost} />
                <input type="hidden" name="markupPct" value={String(row.markupPct * 100)} />
              </form>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit()}
                placeholder="Description (optional)"
                className="min-h-[52px] w-full resize-none rounded-md border-0 bg-transparent py-1.5 px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                rows={2}
              />
            </>
          )}
        </td>
      </tr>
    </>
  );
}

function AddCategoryBlock({
  estimateId,
  costCodes,
  itemsByCode,
  addLineItemAction,
}: {
  estimateId: string;
  costCodes: CostCode[];
  itemsByCode: Record<string, EstimateItemRow[]>;
  addLineItemAction: (fd: FormData) => Promise<void>;
}) {
  const codesWithoutItems = costCodes.filter((cc) => !itemsByCode[cc.code]);
  const [search, setSearch] = React.useState("");
  const [selectedCode, setSelectedCode] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const searchLower = search.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      codesWithoutItems.filter(
        (cc) =>
          !searchLower || cc.code.toLowerCase().includes(searchLower) || (cc.name && cc.name.toLowerCase().includes(searchLower))
      ),
    [codesWithoutItems, searchLower]
  );
  const visibleOptions = filtered.slice(0, 10);
  const hasMore = filtered.length > 10;
  const noMatch = search.trim().length > 0 && filtered.length === 0;

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [search, open]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const item = el.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      const inContainer = containerRef.current?.contains(t) ?? false;
      const inMenu = listRef.current?.contains(t) ?? false;
      if (!inContainer && !inMenu) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const computeMenuPosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const desiredMax = 240;
    const padding = 12;
    const belowTop = rect.bottom + 4;
    const belowAvail = window.innerHeight - belowTop - padding;
    if (belowAvail >= 160) {
      setMenuPos({
        top: belowTop,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(desiredMax, belowAvail)),
      });
      return;
    }
    const aboveAvail = rect.top - padding;
    const maxHeight = Math.max(120, Math.min(desiredMax, aboveAvail));
    setMenuPos({
      top: Math.max(padding, rect.top - 4 - maxHeight),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    computeMenuPosition();
    const onResize = () => computeMenuPosition();
    const onScroll = () => computeMenuPosition();
    window.addEventListener("resize", onResize);
    // capture=true so scroll inside overflow containers also repositions
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, computeMenuPosition]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i < visibleOptions.length - 1 ? i + 1 : i));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cc = visibleOptions[highlightIndex];
      if (cc) {
        setSelectedCode(cc.code);
        setSearch("");
        setOpen(false);
      }
    }
  };

  const handleSelect = (code: string) => {
    setSelectedCode(code);
    setSearch("");
    setOpen(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    if (!selectedCode) {
      e.preventDefault();
      return;
    }
  };

  if (codesWithoutItems.length === 0) return null;

  return (
    <div ref={containerRef} className="px-4 py-3 border-t border-zinc-200 dark:border-border">
      <form action={addLineItemAction} onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="estimateId" value={estimateId} />
        <input type="hidden" name="costCode" value={selectedCode ?? ""} />
        <div className="relative flex-1 min-w-[220px] max-w-[300px]">
          <Label htmlFor="add-category-input" className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Add category
          </Label>
          <div ref={anchorRef} className="relative">
            <Input
              id="add-category-input"
              type="text"
              value={open ? search : selectedCode ? costCodes.find((c) => c.code === selectedCode)?.name ?? `${selectedCode} – selected` : search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
                if (!e.target.value) setSelectedCode(null);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search or select category…"
              className="h-9 rounded-lg border border-zinc-200/60 dark:border-border bg-background px-3 text-sm pr-9"
              autoComplete="off"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
              <ChevronDown className="h-4 w-4" />
            </span>
            {open && menuPos && typeof document !== "undefined"
              ? createPortal(
                  <ul
                    ref={listRef}
                    role="listbox"
                    style={{
                      position: "fixed",
                      top: menuPos.top,
                      left: menuPos.left,
                      width: menuPos.width,
                      maxHeight: menuPos.maxHeight,
                    }}
                    className="z-[100] overflow-y-auto rounded-lg border border-zinc-200/60 dark:border-border bg-background py-1 shadow-lg"
                  >
                    {visibleOptions.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted-foreground">{noMatch ? "No matching category" : "No categories to add"}</li>
                    ) : (
                      visibleOptions.map((cc, i) => (
                        <li
                          key={cc.code}
                          role="option"
                          aria-selected={highlightIndex === i}
                          className={`cursor-pointer px-3 py-2 text-sm ${highlightIndex === i ? "bg-zinc-100 dark:bg-zinc-800 text-foreground" : "text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                          onMouseEnter={() => setHighlightIndex(i)}
                          onClick={() => handleSelect(cc.code)}
                        >
                          {cc.code} – {cc.name}
                        </li>
                      ))
                    )}
                    {hasMore && (
                      <li className="px-3 py-1.5 text-xs text-muted-foreground border-t border-zinc-100 dark:border-border/50">
                        Scroll for more ({filtered.length} total)
                      </li>
                    )}
                  </ul>,
                  document.body
                )
              : null}
          </div>
        </div>
        <Button type="submit" variant="outline" size="sm" className="rounded-lg shrink-0" disabled={!selectedCode}>
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </form>
    </div>
  );
}
