"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstimateAutoResizeTextarea } from "@/app/estimates/_components/estimate-auto-resize-textarea";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";
import { saveEstimateAsTemplateAction } from "./actions";

const FIELD =
  "hh-focus-ring hh-type-text-entry h-hh-control-comfortable rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] focus-visible:border-[var(--hh-border-strong)]";
const PRIMARY_ACTION =
  "hh-focus-ring rounded-hh-compact border border-transparent bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] shadow-none hover:opacity-90";

export function SaveEstimateAsTemplateDialog({
  open,
  onOpenChange,
  estimateId,
  estimateNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  estimateNumber: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState(`${estimateNumber} template`);
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("General");
  const [defaultTaxRate, setDefaultTaxRate] = React.useState("");
  const [defaultTerms, setDefaultTerms] = React.useState("");
  const [busy, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) setName(`${estimateNumber} template`);
  }, [estimateNumber, open]);

  const save = (): void => {
    const fd = new FormData();
    fd.set("estimateId", estimateId);
    fd.set("name", name);
    fd.set("description", description);
    fd.set("category", category);
    fd.set("defaultTaxRate", defaultTaxRate);
    fd.set("defaultTerms", defaultTerms);

    startTransition(() => {
      void saveEstimateAsTemplateAction(fd).then((result) => {
        if (!result.ok) {
          toast({
            title: "Could not save template",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({
          title: "Template saved",
          description: "Scope and line items are available for future estimates.",
          variant: "success",
        });
        onOpenChange(false);
        router.refresh();
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="save-estimate-as-template-dialog">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Copies scope sections, line items, descriptions, quantities, and prices. Customer,
            project, dates, payments, invoice links, and status are not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
            Template Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={cn(FIELD, "mt-1")}
              data-testid="save-template-name"
            />
          </label>
          <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
            Description
            <EstimateAutoResizeTextarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={cn(FIELD, "mt-1 min-h-[72px] py-2")}
              minHeight={72}
              maxHeight={220}
              placeholder="When should this template be used?"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
              Category
              <Input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={cn(FIELD, "mt-1")}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
              Default Tax Rate
              <Input
                value={defaultTaxRate}
                onChange={(event) => setDefaultTaxRate(event.target.value)}
                className={cn(FIELD, "mt-1")}
                type="number"
                min={0}
                step="0.01"
                placeholder="Optional"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
            Default Terms
            <EstimateAutoResizeTextarea
              value={defaultTerms}
              onChange={(event) => setDefaultTerms(event.target.value)}
              className={cn(FIELD, "mt-1 min-h-[90px] py-2")}
              minHeight={90}
              maxHeight={260}
              placeholder="Optional reusable proposal terms…"
            />
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={PRIMARY_ACTION}
            onClick={save}
            disabled={busy || !name.trim()}
            data-testid="save-estimate-as-template-submit"
          >
            {busy ? "Saving…" : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
