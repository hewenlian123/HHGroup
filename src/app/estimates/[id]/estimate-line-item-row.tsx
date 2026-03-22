"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstimateItemRow, CostCode } from "@/lib/data";
import { Copy, Trash2 } from "lucide-react";

function parseDesc(desc: string): { title: string; description: string } {
  const idx = desc.indexOf("\n");
  if (idx < 0) return { title: desc, description: "" };
  return { title: desc.slice(0, idx), description: desc.slice(idx + 1) };
}

function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
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
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      rows={2}
    />
  );
}

export function EstimateLineItemRow({
  row,
  estimateId,
  code,
  isLocked,
  lineTotal,
  updateLineItemAction,
  duplicateLineItemAction,
  deleteLineItemAction,
}: {
  row: EstimateItemRow;
  estimateId: string;
  code: CostCode;
  isLocked: boolean;
  lineTotal: number;
  updateLineItemAction: (formData: FormData) => Promise<void>;
  duplicateLineItemAction: (formData: FormData) => Promise<void>;
  deleteLineItemAction: (formData: FormData) => Promise<void>;
}) {
  const parsed = React.useMemo(() => parseDesc(row.desc), [row.desc]);
  const [title, setTitle] = React.useState(parsed.title);
  const [description, setDescription] = React.useState(parsed.description);
  const [qty, setQty] = React.useState(row.qty);
  const [unit, setUnit] = React.useState(row.unit);
  const [unitCost, setUnitCost] = React.useState(row.unitCost);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    setTitle(parsed.title);
    setDescription(parsed.description);
    setQty(row.qty);
    setUnit(row.unit);
    setUnitCost(row.unitCost);
  }, [row.id, row.desc, row.qty, row.unit, row.unitCost, parsed.title, parsed.description]);

  const combinedDesc = description.trim() ? `${title}\n${description}` : title;
  const formId = `line-${row.id}`;

  const submitForm = () => {
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <tr className="border-b border-zinc-100/50 dark:border-border/30">
        <td className="py-2 px-4 align-top">
          {isLocked ? (
            <span className="font-medium text-foreground">{title || row.desc}</span>
          ) : (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={submitForm}
              className="h-8 text-sm"
              placeholder="Title"
            />
          )}
        </td>
        <td className="py-2 px-4 text-right align-top">
          {isLocked ? (
            row.qty
          ) : (
            <Input
              form={formId}
              type="number"
              name="qty"
              step="1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 0)}
              onBlur={submitForm}
              className="h-8 w-16 text-right"
            />
          )}
        </td>
        <td className="py-2 px-4 align-top">
          {isLocked ? (
            row.unit
          ) : (
            <Input
              form={formId}
              name="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onBlur={submitForm}
              className="h-8 w-14"
            />
          )}
        </td>
        <td className="py-2 px-4 text-right align-top">
          {isLocked ? (
            `$${row.unitCost.toLocaleString()}`
          ) : (
            <Input
              form={formId}
              type="number"
              name="unitCost"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              onBlur={submitForm}
              className="h-8 w-20 text-right"
            />
          )}
        </td>
        <td className="py-2 px-4 align-top text-muted-foreground text-xs">{code.code}</td>
        <td className="py-2 px-4 align-top text-right tabular-nums font-medium">
          ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </td>
        {!isLocked && (
          <td className="py-2 px-2 align-top">
            <div className="flex items-center gap-1">
              <form action={duplicateLineItemAction} className="inline">
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Duplicate"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </form>
              <form action={deleteLineItemAction} className="inline">
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </td>
        )}
      </tr>
      <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-zinc-50/30 dark:bg-zinc-900/20">
        <td colSpan={isLocked ? 6 : 7} className="py-1.5 px-4 align-top">
          {isLocked ? (
            description ? (
              <span className="text-sm text-muted-foreground">{description}</span>
            ) : null
          ) : (
            <>
              <form
                ref={formRef}
                action={updateLineItemAction}
                id={formId}
                className="hidden"
                aria-hidden
              >
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="itemId" value={row.id} />
                <input type="hidden" name="desc" value={combinedDesc} />
                <input type="hidden" name="qty" value={qty} />
                <input type="hidden" name="unit" value={unit} />
                <input type="hidden" name="unitCost" value={unitCost} />
                <input type="hidden" name="markupPct" value={String(row.markupPct * 100)} />
              </form>
              <AutoExpandTextarea
                value={description}
                onChange={setDescription}
                onBlur={submitForm}
                placeholder="Description (optional)"
                className="min-h-[52px] w-full resize-none rounded-md border-0 bg-transparent py-1.5 px-0 text-sm text-muted-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
              />
            </>
          )}
        </td>
      </tr>
    </>
  );
}
