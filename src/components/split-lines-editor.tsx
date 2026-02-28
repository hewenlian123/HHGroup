"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SplitLineRow {
  id: string;
  projectId: string | null;
  category: string;
  costCode?: string | null;
  memo?: string | null;
  amount: number;
}

export interface SplitLinesEditorProps {
  lines: SplitLineRow[];
  onLineChange: (lineId: string, patch: Partial<SplitLineRow>) => void;
  onAddLine: () => void;
  onDeleteLine: (lineId: string) => void;
  /** Show cost code column (e.g. expense detail) */
  showCostCode?: boolean;
  /** Show Vendor + Payment Method header row (e.g. bank reconcile) */
  showHeaderVendorPayment?: boolean;
  vendorName?: string;
  onVendorNameChange?: (v: string) => void;
  paymentMethod?: string;
  onPaymentMethodChange?: (v: string) => void;
  /** When set, show Needed / Lines total / Remaining (bank reconcile) */
  targetAmount?: number;
  /** Options and callbacks for creatable selects */
  projects: Array<{ id: string; name: string }>;
  categories: string[];
  vendorsList: string[];
  paymentMethodsList: string[];
  onAddCategory: (name: string) => string;
  onAddVendor: (name: string) => string;
  onAddPaymentMethod: (name: string) => string;
  onToast?: (msg: string) => void;
  isExpenseCategoryDisabled: (name: string) => boolean;
  isVendorDisabled: (name: string) => boolean;
  isPaymentMethodDisabled: (name: string) => boolean;
  /** Min lines (disable delete when at this count) */
  minLines?: number;
  /** Optional id for first line amount input (for focus management) */
  firstFocusId?: string;
  /** When set, focus the amount input of the line with this id (e.g. after add line) */
  focusLineId?: string | null;
  /** Called after focusLineId has been applied */
  onFocusLineHandled?: () => void;
}

export function SplitLinesEditor({
  lines,
  onLineChange,
  onAddLine,
  onDeleteLine,
  showCostCode = false,
  showHeaderVendorPayment = false,
  vendorName = "",
  onVendorNameChange,
  paymentMethod = "ACH",
  onPaymentMethodChange,
  targetAmount,
  projects,
  categories,
  vendorsList,
  paymentMethodsList,
  onAddCategory,
  onAddVendor,
  onAddPaymentMethod,
  onToast,
  isExpenseCategoryDisabled,
  isVendorDisabled,
  isPaymentMethodDisabled,
  minLines = 1,
  firstFocusId,
  focusLineId,
  onFocusLineHandled,
}: SplitLinesEditorProps) {
  const linesTotal = React.useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);
  const remaining = targetAmount != null ? targetAmount - linesTotal : 0;
  const focusLineAmountRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!focusLineId || !focusLineAmountRef.current) return;
    focusLineAmountRef.current.focus();
    onFocusLineHandled?.();
  }, [focusLineId, onFocusLineHandled]);

  return (
    <div className="space-y-4">
      {showHeaderVendorPayment && onVendorNameChange && onPaymentMethodChange && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <CreatableSelect
              label="Vendor"
              value={vendorName}
              options={vendorsList}
              placeholder="Vendor name"
              onChange={onVendorNameChange}
              onCreate={(name) => {
                const toSelect = onAddVendor(name);
                if (toSelect) {
                  onVendorNameChange(toSelect);
                  onToast?.(`Added vendor: ${toSelect}`);
                }
              }}
            />
            {vendorName && isVendorDisabled(vendorName) && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">Disabled</span>
            )}
          </div>
          <div>
            <CreatableSelect
              label="Payment method"
              value={paymentMethod}
              options={paymentMethodsList}
              placeholder="Payment method"
              onChange={onPaymentMethodChange}
              onCreate={(name) => {
                const toSelect = onAddPaymentMethod(name);
                if (toSelect) {
                  onPaymentMethodChange(toSelect);
                  onToast?.(`Added payment method: ${toSelect}`);
                }
              }}
            />
            {paymentMethod && isPaymentMethodDisabled(paymentMethod) && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">Disabled</span>
            )}
          </div>
        </div>
      )}

      {targetAmount != null && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-zinc-200/60 dark:border-border bg-muted/20 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Needed</p>
            <p className="text-lg font-bold tabular-nums">${targetAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lines total</p>
            <p className="text-lg font-bold tabular-nums text-red-600/90 dark:text-red-400/90">${linesTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Remaining</p>
            <p className={cn("text-lg font-bold tabular-nums", remaining !== 0 && "text-red-600 dark:text-red-400")}>
              ${remaining.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Split lines</h3>
        <Button type="button" variant="outline" size="sm" onClick={onAddLine} className="rounded-lg">
          <Plus className="h-4 w-4 mr-1" />
          Add line
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Project</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Category</TableHead>
              {showCostCode && (
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Cost code</TableHead>
              )}
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Memo</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id} className="border-b border-zinc-100/50 dark:border-border/30">
                <TableCell>
                  <select
                    className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm min-h-[36px]"
                    value={line.projectId ?? ""}
                    onChange={(e) => onLineChange(line.id, { projectId: e.target.value || null })}
                  >
                    <option value="">Overhead (No project)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <div className="min-w-[120px]">
                    <CreatableSelect
                      label=""
                      value={line.category}
                      options={categories}
                      placeholder="Category"
                      onChange={(v) => onLineChange(line.id, { category: v })}
                      onCreate={(name) => {
                        const toSelect = onAddCategory(name);
                        if (toSelect) {
                          onLineChange(line.id, { category: toSelect });
                          onToast?.(`Added category: ${toSelect}`);
                        }
                      }}
                    />
                    {line.category && isExpenseCategoryDisabled(line.category) && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 inline-block">Disabled</span>
                    )}
                  </div>
                </TableCell>
                {showCostCode && (
                  <TableCell>
                    <Input
                      className="h-8 text-sm"
                      value={line.costCode ?? ""}
                      onChange={(e) => onLineChange(line.id, { costCode: e.target.value || null })}
                      placeholder="Optional"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Input
                    className="h-8 text-sm"
                    value={line.memo ?? ""}
                    onChange={(e) => onLineChange(line.id, { memo: e.target.value || null })}
                    placeholder="Memo"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    ref={line.id === focusLineId ? focusLineAmountRef : undefined}
                    id={lines[0]?.id === line.id ? firstFocusId : undefined}
                    type="number"
                    min={0}
                    step={0.01}
                    className="h-8 w-24 text-right tabular-nums ml-auto"
                    value={line.amount}
                    onChange={(e) => onLineChange(line.id, { amount: parseFloat(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => onDeleteLine(line.id)}
                    aria-label="Delete line"
                    disabled={lines.length <= minLines}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
