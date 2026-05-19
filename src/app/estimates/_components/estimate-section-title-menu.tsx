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
  createCustomEstimateCategoryAction,
} from "@/app/estimates/[id]/actions";
import { cn } from "@/lib/utils";

export type EstimateSectionOption = { code: string; label: string };

/** @deprecated Use EstimateSectionOption */
export type CostCategoryOption = EstimateSectionOption;

type AddSectionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  onSectionCreated: (costCode: string, displayName: string) => void;
};

function AddSectionModal({
  open,
  onOpenChange,
  estimateId,
  onSectionCreated,
}: AddSectionModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [addNameDraft, setAddNameDraft] = React.useState("");
  const [addSaving, setAddSaving] = React.useState(false);
  const addDisplayNameRef = React.useRef<HTMLInputElement>(null);
  const wasOpenRef = React.useRef(false);

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

  const commitAddSection = React.useCallback(async () => {
    const name = addNameDraft.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter a section name.", variant: "error" });
      addDisplayNameRef.current?.focus();
      return;
    }
    setAddSaving(true);
    try {
      const res = await createCustomEstimateCategoryAction(estimateId, name);
      if (res.ok && res.costCode) {
        onSectionCreated(res.costCode, name);
        syncRouterNonBlocking(router);
        onOpenChange(false);
        toast({ title: "Section created", variant: "success" });
      } else {
        toast({
          title: "Could not create section",
          description: res.error ?? "Try again.",
          variant: "error",
        });
      }
    } finally {
      setAddSaving(false);
    }
  }, [addNameDraft, estimateId, onSectionCreated, onOpenChange, router, toast]);

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
          <DialogTitle className="text-base">Add section</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Creates a scope section and first line on this estimate.
          </p>
        </DialogHeader>
        <div className="space-y-1.5 pb-4">
          <Label htmlFor={`section-add-name-${estimateId}`} className="text-xs">
            Section name
          </Label>
          <Input
            ref={addDisplayNameRef}
            id={`section-add-name-${estimateId}`}
            value={addNameDraft}
            onChange={(e) => setAddNameDraft(e.target.value)}
            className="h-8 rounded-sm text-sm"
            disabled={addSaving}
            placeholder="e.g. Demolition"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitAddSection();
              }
            }}
            autoComplete="off"
          />
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
            onClick={() => void commitAddSection()}
          >
            <SubmitSpinner loading={addSaving} className="mr-2" />
            {addSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EstimateSectionTitleMenuProps = {
  estimateId: string;
  currentCostCode: string;
  displayName: string;
  itemIds: string[];
  sectionOptions: EstimateSectionOption[];
  /** Resolved display name for upsert when moving to a section (catalog or saved label). */
  getDisplayNameHint: (code: string) => string;
  onMoved: (newCostCode: string) => void;
  onNameSaved: (costCode: string, nextDisplayName: string) => void;
  /** After a successful create from the Add section modal — parent refreshes selection / local state. */
  onSectionCreated: (costCode: string, displayName: string) => void;
};

/**
 * Section row: plain label; click opens menu to switch section, add section, or rename.
 */
export function EstimateSectionTitleMenu({
  estimateId,
  currentCostCode,
  displayName,
  itemIds,
  sectionOptions,
  getDisplayNameHint,
  onMoved,
  onNameSaved,
  onSectionCreated,
}: EstimateSectionTitleMenuProps): React.ReactElement {
  const { toast } = useToast();
  const [moving, setMoving] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameDraft, setRenameDraft] = React.useState(displayName);
  const [renameSaving, setRenameSaving] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const headerLabel = displayName.trim() || "Section";

  React.useEffect(() => {
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
            title: "Could not move section",
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
      toast({ title: "Name required", description: "Enter a section name.", variant: "error" });
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
              "text-[15px] font-semibold tracking-tight text-foreground",
              "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              moving && "opacity-60 pointer-events-none"
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Section: ${headerLabel}. Open menu to change or rename.`}
          >
            <span className="truncate min-w-0">{headerLabel}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[16rem] max-h-72 overflow-y-auto rounded-md border-border/15 z-[120]"
        >
          {sectionOptions.map((o) => (
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
            + Add section
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-sm"
            onSelect={() => {
              setRenameDraft(displayName);
              setRenameOpen(true);
            }}
          >
            Rename section…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddSectionModal
        open={addOpen}
        onOpenChange={setAddOpen}
        estimateId={estimateId}
        onSectionCreated={onSectionCreated}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="gap-0 sm:max-w-md rounded-sm border-border/60 p-4 shadow-[var(--shadow-popover)]">
          <DialogHeader className="space-y-1 pb-3">
            <DialogTitle className="text-base">Rename section</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pb-4">
            <Label htmlFor={`section-rename-${currentCostCode}`} className="text-xs">
              Name
            </Label>
            <Input
              id={`section-rename-${currentCostCode}`}
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

/** @deprecated Use EstimateSectionTitleMenu */
export const CostCategoryTitleMenu = EstimateSectionTitleMenu;
