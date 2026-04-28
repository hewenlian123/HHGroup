"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast/toast-provider";
import {
  moveEstimateItemsToCostCodeAction,
  saveCostCategoryNameInlineAction,
  createEstimateCategoryWithCodeAction,
} from "@/app/estimates/[id]/actions";
import { generateCode } from "@/lib/estimate-cost-code-suggest";
import { cn } from "@/lib/utils";

export type CostCategoryOption = { code: string; label: string };

type AddCategoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  /** Existing cost codes on this estimate (same set used for duplicate checks). */
  categories: ReadonlySet<string>;
  onCategoryCreated: (costCode: string, displayName: string) => void;
};

function AddCategoryModal({
  open,
  onOpenChange,
  estimateId,
  categories,
  onCategoryCreated,
}: AddCategoryModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [addCodeDraft, setAddCodeDraft] = React.useState("");
  const [addNameDraft, setAddNameDraft] = React.useState("");
  const [addSaving, setAddSaving] = React.useState(false);
  const addDisplayNameRef = React.useRef<HTMLInputElement>(null);
  const wasOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    setAddCodeDraft(generateCode(categories));
  }, [open, categories]);

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAddNameDraft("");
    }
    wasOpenRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      addDisplayNameRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const commitAddCategory = React.useCallback(async () => {
    const code = addCodeDraft.trim();
    const name = addNameDraft.trim();
    if (!code) {
      toast({ title: "Code required", description: "Enter a cost code.", variant: "error" });
      return;
    }
    if (!name) {
      toast({ title: "Name required", description: "Enter a display name.", variant: "error" });
      addDisplayNameRef.current?.focus();
      return;
    }
    if (categories.has(code)) {
      toast({
        title: "Code already exists",
        description:
          "This code is already used on this estimate. Change the code or use the generated value.",
        variant: "error",
      });
      return;
    }
    setAddSaving(true);
    try {
      const res = await createEstimateCategoryWithCodeAction(estimateId, code, name);
      if (res.ok && res.costCode) {
        onCategoryCreated(res.costCode, name);
        syncRouterNonBlocking(router);
        onOpenChange(false);
        toast({ title: "Category created", variant: "success" });
      } else {
        toast({
          title: "Could not create category",
          description: res.error ?? "Try again.",
          variant: "error",
        });
      }
    } finally {
      setAddSaving(false);
    }
  }, [
    addCodeDraft,
    addNameDraft,
    categories,
    estimateId,
    onCategoryCreated,
    onOpenChange,
    router,
    toast,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setAddSaving(false);
      }}
    >
      <DialogContent className="gap-0 sm:max-w-md rounded-sm border-border/60 p-4 shadow-[var(--shadow-popover)]">
        <DialogHeader className="space-y-1 pb-3">
          <DialogTitle className="text-base">Add new category</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Creates a cost code and first line on this estimate.
          </p>
        </DialogHeader>
        <div className="space-y-3 pb-4">
          <div className="space-y-1.5">
            <Label htmlFor={`cat-add-code-${estimateId}`} className="text-xs">
              Code
            </Label>
            <Input
              id={`cat-add-code-${estimateId}`}
              value={addCodeDraft}
              onChange={(e) => setAddCodeDraft(e.target.value)}
              className="h-8 rounded-sm text-sm tabular-nums"
              disabled={addSaving}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`cat-add-name-${estimateId}`} className="text-xs">
              Display name
            </Label>
            <Input
              ref={addDisplayNameRef}
              id={`cat-add-name-${estimateId}`}
              value={addNameDraft}
              onChange={(e) => setAddNameDraft(e.target.value)}
              className="h-8 rounded-sm text-sm"
              disabled={addSaving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitAddCategory();
                }
              }}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter className="border-t-0 pt-0 sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-sm h-8"
            disabled={addSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-sm h-8"
            disabled={addSaving}
            onClick={() => void commitAddCategory()}
          >
            <SubmitSpinner loading={addSaving} className="mr-2" />
            {addSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Props = {
  estimateId: string;
  currentCostCode: string;
  displayName: string;
  itemIds: string[];
  categoryOptions: CostCategoryOption[];
  /** Resolved display name for upsert when moving to a code (catalog or saved label). */
  getDisplayNameHint: (code: string) => string;
  onMoved: (newCostCode: string) => void;
  onNameSaved: (costCode: string, nextDisplayName: string) => void;
  /** Cost codes already used on this estimate (items + categories) for suggestions and client-side checks. */
  usedCostCodes: ReadonlySet<string>;
  /** After a successful create from the Add category modal — parent refreshes selection / local state. */
  onCategoryCreated: (costCode: string, displayName: string) => void;
};

/**
 * Cost breakdown category row: looks like plain text; click opens menu to switch category, add category, or rename.
 */
export function CostCategoryTitleMenu({
  estimateId,
  currentCostCode,
  displayName,
  itemIds,
  categoryOptions,
  getDisplayNameHint,
  onMoved,
  onNameSaved,
  usedCostCodes,
  onCategoryCreated,
}: Props) {
  const { toast } = useToast();
  const [moving, setMoving] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameDraft, setRenameDraft] = React.useState(displayName);
  const [renameSaving, setRenameSaving] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  React.useEffect(() => {
    // Keep draft in sync when label changes outside the dialog.
    // Do not clobber user typing while the rename dialog is open.
    if (renameOpen) return;
    setRenameDraft(displayName);
  }, [displayName, renameOpen]);

  const handleMove = React.useCallback(
    async (newCode: string) => {
      if (newCode === currentCostCode || moving) return;
      setMoving(true);
      try {
        const hint = getDisplayNameHint(newCode);
        const res = await moveEstimateItemsToCostCodeAction(estimateId, itemIds, newCode, hint);
        if (res.ok) {
          onMoved(newCode);
        } else {
          toast({
            title: "Could not move category",
            description: res.error ?? "Try again.",
            variant: "error",
          });
        }
      } finally {
        setMoving(false);
      }
    },
    [currentCostCode, moving, estimateId, itemIds, getDisplayNameHint, onMoved, toast]
  );

  const commitRename = React.useCallback(async () => {
    const next = renameDraft.trim();
    if (!next) {
      toast({ title: "Name required", description: "Enter a category label.", variant: "error" });
      return;
    }
    if (next === displayName.trim()) {
      setRenameOpen(false);
      return;
    }
    setRenameSaving(true);
    try {
      const res = await saveCostCategoryNameInlineAction(estimateId, currentCostCode, next);
      if (res.ok) {
        onNameSaved(currentCostCode, next);
        setRenameOpen(false);
      } else {
        toast({ title: "Save failed", description: res.error ?? "Try again.", variant: "error" });
      }
    } finally {
      setRenameSaving(false);
    }
  }, [renameDraft, displayName, estimateId, currentCostCode, onNameSaved, toast]);

  const openAddModal = React.useCallback(() => {
    setAddOpen(true);
  }, []);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={moving}
            className={cn(
              "h-7 min-w-0 flex-1 text-left flex items-center gap-1.5 rounded-sm px-0.5 -mx-0.5",
              "font-medium text-sm text-foreground",
              "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              moving && "opacity-60 pointer-events-none"
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Category: open menu to change cost code"
          >
            <span className="text-muted-foreground font-normal tabular-nums shrink-0">
              {currentCostCode}
            </span>
            <span className="text-muted-foreground/50 shrink-0" aria-hidden>
              –
            </span>
            <span className="truncate min-w-0">{displayName || currentCostCode}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[16rem] max-h-72 overflow-y-auto rounded-md z-[120]"
        >
          {categoryOptions.map((o) => (
            <DropdownMenuItem
              key={o.code}
              disabled={o.code === currentCostCode}
              className="text-sm"
              onSelect={() => void handleMove(o.code)}
            >
              {o.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-sm"
            onSelect={() => {
              window.setTimeout(() => openAddModal(), 0);
            }}
          >
            + Add new category
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-sm"
            onSelect={() => {
              setRenameDraft(displayName);
              setRenameOpen(true);
            }}
          >
            Edit display name…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddCategoryModal
        open={addOpen}
        onOpenChange={setAddOpen}
        estimateId={estimateId}
        categories={usedCostCodes}
        onCategoryCreated={onCategoryCreated}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="gap-0 sm:max-w-md rounded-sm border-border/60 p-4 shadow-[var(--shadow-popover)]">
          <DialogHeader className="space-y-1 pb-3">
            <DialogTitle className="text-base">Category display name</DialogTitle>
            <p className="text-xs text-muted-foreground tabular-nums">{currentCostCode}</p>
          </DialogHeader>
          <div className="space-y-1.5 pb-4">
            <Label htmlFor={`cat-rename-${currentCostCode}`} className="text-xs">
              Name
            </Label>
            <Input
              id={`cat-rename-${currentCostCode}`}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-8 rounded-sm text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename();
                }
              }}
              disabled={renameSaving}
            />
          </div>
          <DialogFooter className="border-t-0 pt-0 sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm h-8"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-sm h-8"
              disabled={renameSaving}
              onClick={() => void commitRename()}
            >
              <SubmitSpinner loading={renameSaving} className="mr-2" />
              {renameSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
