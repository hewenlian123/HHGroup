"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Edit3, FileText, Plus, Search, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstimateAutoResizeTextarea } from "@/app/estimates/_components/estimate-auto-resize-textarea";
import { formatEstimateCurrency } from "@/app/estimates/_components/estimate-currency";
import { useToast } from "@/components/toast/toast-provider";
import { FilterToolbar, NeoPanel, NeoStatus, NeoTable } from "@/components/base";
import { tableRawThClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  normalizeEstimateTemplateData,
  type EstimateTemplateData,
  type EstimateTemplateRecord,
  type EstimateTemplateSection,
} from "@/lib/estimate-templates";
import {
  archiveEstimateTemplateAction,
  createEstimateTemplateAction,
  deleteEstimateTemplateAction,
  duplicateEstimateTemplateAction,
  updateEstimateTemplateAction,
} from "./actions";

type TemplateDraftItem = {
  id: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
};

type TemplateDraftSection = {
  id: string;
  title: string;
  items: TemplateDraftItem[];
};

type TemplateDraft = {
  id?: string;
  name: string;
  description: string;
  category: string;
  defaultTaxRate: string;
  defaultTerms: string;
  sections: TemplateDraftSection[];
};

const FIELD =
  "h-10 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[14px] text-[var(--neo-text-primary)] shadow-none placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";
const PRIMARY_ACTION =
  "rounded-md border border-[rgb(198_165_106_/_0.28)] bg-[var(--neo-gold)] text-zinc-950 shadow-sm hover:bg-[var(--neo-gold-soft)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";
const SECONDARY_ACTION =
  "rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-none hover:border-[var(--neo-border-strong)] hover:bg-[var(--neo-surface-muted)]";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyItem(): TemplateDraftItem {
  return {
    id: makeId("template-item"),
    title: "",
    description: "",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
  };
}

function emptyDraft(): TemplateDraft {
  return {
    name: "",
    description: "",
    category: "General",
    defaultTaxRate: "",
    defaultTerms: "",
    sections: [
      {
        id: makeId("template-section"),
        title: "Scope Section",
        items: [emptyItem()],
      },
    ],
  };
}

function draftFromTemplate(template: EstimateTemplateRecord): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    defaultTaxRate: template.defaultTaxRate == null ? "" : String(template.defaultTaxRate),
    defaultTerms: template.defaultTerms ?? "",
    sections: template.templateData.sections.length
      ? template.templateData.sections.map((section) => ({
          id: makeId("template-section"),
          title: section.title,
          items: section.items.length
            ? section.items.map((item) => ({
                id: makeId("template-item"),
                title: item.title,
                description: item.description,
                qty: item.qty,
                unit: item.unit,
                unitPrice: item.unitPrice,
              }))
            : [emptyItem()],
        }))
      : emptyDraft().sections,
  };
}

function draftToTemplateData(draft: TemplateDraft): EstimateTemplateData {
  const sections: EstimateTemplateSection[] = draft.sections
    .map((section) => ({
      title: section.title.trim(),
      items: section.items
        .map((item) => ({
          title: item.title.trim() || "Line item",
          description: item.description.trim(),
          qty: Number.isFinite(item.qty) ? item.qty : 0,
          unit: item.unit.trim() || "EA",
          unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
          status: "included",
          hideAmountOnPdf: false,
        }))
        .filter((item) => item.title || item.description),
    }))
    .filter((section) => section.title && section.items.length > 0);

  return normalizeEstimateTemplateData({
    version: 1,
    sections,
    notes: draft.defaultTerms.trim()
      ? [
          {
            id: "template-default-terms",
            type: "payment_terms",
            title: "Payment Terms",
            body: draft.defaultTerms.trim(),
          },
        ]
      : [],
  });
}

function templateSubtotal(template: EstimateTemplateRecord): number {
  return template.templateData.sections.reduce(
    (sum, section) =>
      sum + section.items.reduce((sectionSum, item) => sectionSum + item.qty * item.unitPrice, 0),
    0
  );
}

function templateItemCount(template: EstimateTemplateRecord): number {
  return template.templateData.sections.reduce((sum, section) => sum + section.items.length, 0);
}

export function EstimateTemplatesClient({ templates }: { templates: EstimateTemplateRecord[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<TemplateDraft>(() => emptyDraft());
  const [busy, startTransition] = React.useTransition();

  const visibleTemplates = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (!showArchived && template.isArchived) return false;
      if (!q) return true;
      return [template.name, template.description, template.category]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [query, showArchived, templates]);

  const activeTemplates = templates.filter((template) => !template.isArchived);

  const openCreate = (): void => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (template: EstimateTemplateRecord): void => {
    setDraft(draftFromTemplate(template));
    setDialogOpen(true);
  };

  const updateSection = (sectionId: string, patch: Partial<TemplateDraftSection>): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      ),
    }));
  };

  const updateItem = (
    sectionId: string,
    itemId: string,
    patch: Partial<TemplateDraftItem>
  ): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : section
      ),
    }));
  };

  const addSection = (): void => {
    setDraft((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          id: makeId("template-section"),
          title: `Section ${current.sections.length + 1}`,
          items: [emptyItem()],
        },
      ],
    }));
  };

  const removeSection = (sectionId: string): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId),
    }));
  };

  const addItem = (sectionId: string): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, items: [...section.items, emptyItem()] } : section
      ),
    }));
  };

  const removeItem = (sectionId: string, itemId: string): void => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      ),
    }));
  };

  const runTemplateAction = (
    label: string,
    runner: () => Promise<{ ok: boolean; id?: string; error?: string }>
  ): void => {
    startTransition(() => {
      void runner().then((result) => {
        if (!result.ok) {
          toast({
            title: `${label} failed`,
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({ title: label, variant: "success" });
        router.refresh();
      });
    });
  };

  const saveDraft = (): void => {
    const fd = new FormData();
    if (draft.id) fd.set("templateId", draft.id);
    fd.set("name", draft.name);
    fd.set("description", draft.description);
    fd.set("category", draft.category);
    fd.set("defaultTaxRate", draft.defaultTaxRate);
    fd.set("defaultTerms", draft.defaultTerms);
    fd.set("templateData", JSON.stringify(draftToTemplateData(draft)));

    startTransition(() => {
      void (draft.id ? updateEstimateTemplateAction(fd) : createEstimateTemplateAction(fd)).then(
        (result) => {
          if (!result.ok) {
            toast({
              title: "Template save failed",
              description: result.error ?? "Please try again.",
              variant: "error",
            });
            return;
          }
          toast({ title: "Template saved", variant: "success" });
          setDialogOpen(false);
          router.refresh();
        }
      );
    });
  };

  return (
    <div className="space-y-4">
      <FilterToolbar className="items-stretch gap-2 md:items-center md:justify-between">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]"
            aria-hidden
          />
          <Input
            data-testid="estimate-template-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            className={cn(FIELD, "pl-9")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SECONDARY_ACTION}
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button
            type="button"
            size="sm"
            className={PRIMARY_ACTION}
            onClick={openCreate}
            data-testid="estimate-template-create"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      </FilterToolbar>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {activeTemplates.slice(0, 6).map((template) => (
          <NeoPanel
            key={template.id}
            className="transition-colors hover:border-[rgb(184_137_45_/_0.32)]"
            bodyClassName="p-4"
          >
            <div className="flex min-h-[188px] flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[var(--neo-text-tertiary)]">
                    {template.category}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold text-[var(--neo-text-primary)]">
                    {template.name}
                  </h2>
                  {template.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--neo-text-secondary)]">
                      {template.description}
                    </p>
                  ) : null}
                </div>
                <FileText className="h-5 w-5 shrink-0 text-[var(--neo-gold-soft)]" aria-hidden />
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 text-xs text-[var(--neo-text-tertiary)]">
                <span>
                  <strong className="block text-sm text-[var(--neo-text-primary)]">
                    {template.templateData.sections.length}
                  </strong>
                  sections
                </span>
                <span>
                  <strong className="block text-sm text-[var(--neo-text-primary)]">
                    {templateItemCount(template)}
                  </strong>
                  items
                </span>
                <span>
                  <strong className="block text-sm text-[var(--neo-text-primary)] tabular-nums">
                    {formatEstimateCurrency(templateSubtotal(template))}
                  </strong>
                  base
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" className={cn("flex-1", PRIMARY_ACTION)}>
                  <Link href={`/estimates/new?templateId=${template.id}`}>Use Template</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={SECONDARY_ACTION}
                  onClick={() =>
                    runTemplateAction("Template duplicated", () =>
                      duplicateEstimateTemplateAction(template.id)
                    )
                  }
                  aria-label={`Duplicate ${template.name}`}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </NeoPanel>
        ))}
      </div>

      <NeoPanel
        eyebrow="Template library"
        title="Reusable estimate scopes"
        description="Edit, duplicate, archive, or delete reusable proposal templates."
        bodyClassName="p-0"
      >
        <NeoTable>
          <thead>
            <tr>
              <th className={tableRawThClass}>Template</th>
              <th className={tableRawThClass}>Category</th>
              <th className={tableRawThClass}>Scope</th>
              <th className={tableRawThClass}>Default tax</th>
              <th className={cn(tableRawThClass, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleTemplates.map((template) => (
              <tr
                key={template.id}
                className="border-t border-[var(--neo-border)] hover:bg-[var(--neo-surface-muted)]"
                data-testid="estimate-template-row"
              >
                <td className="px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--neo-text-primary)]">
                        {template.name}
                      </span>
                      {template.isArchived ? (
                        <NeoStatus label="Archived" variant="muted" className="h-5 text-[10px]" />
                      ) : null}
                    </div>
                    {template.description ? (
                      <p className="mt-0.5 max-w-xl text-xs text-[var(--neo-text-tertiary)]">
                        {template.description}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-[var(--neo-text-secondary)]">{template.category}</td>
                <td className="px-3 py-3 text-[var(--neo-text-secondary)]">
                  {template.templateData.sections.length} sections · {templateItemCount(template)}{" "}
                  items
                </td>
                <td className="px-3 py-3 text-[var(--neo-text-secondary)] tabular-nums">
                  {template.defaultTaxRate == null ? "—" : `${template.defaultTaxRate}%`}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="inline-flex items-center justify-end gap-2">
                    <Button asChild size="sm" className={PRIMARY_ACTION}>
                      <Link href={`/estimates/new?templateId=${template.id}`}>Use</Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={SECONDARY_ACTION}
                          aria-label={`Actions for ${template.name}`}
                        >
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[210px] rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-1 text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]"
                      >
                        <DropdownMenuItem onSelect={() => openEdit(template)}>
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            runTemplateAction("Template duplicated", () =>
                              duplicateEstimateTemplateAction(template.id)
                            )
                          }
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            runTemplateAction(
                              template.isArchived ? "Template restored" : "Template archived",
                              () => archiveEstimateTemplateAction(template.id, !template.isArchived)
                            )
                          }
                        >
                          {template.isArchived ? (
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                          ) : (
                            <Archive className="mr-2 h-4 w-4" />
                          )}
                          {template.isArchived ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-300 focus:text-rose-300"
                          onSelect={() => {
                            if (!window.confirm(`Delete ${template.name}?`)) return;
                            runTemplateAction("Template deleted", () =>
                              deleteEstimateTemplateAction(template.id)
                            );
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
            {visibleTemplates.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-sm text-[var(--neo-text-tertiary)]"
                >
                  No matching templates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </NeoTable>
      </NeoPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[920px]" data-testid="estimate-template-dialog">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Build reusable proposal sections and line items. Customer, project, payments, and
              invoices are never stored in templates.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--neo-text-secondary)]">
                Template Name
                <Input
                  data-testid="estimate-template-name"
                  value={draft.name}
                  onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                  className={cn(FIELD, "mt-1")}
                  placeholder="Kitchen Remodel"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--neo-text-secondary)]">
                Description
                <EstimateAutoResizeTextarea
                  value={draft.description}
                  onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
                  className={cn(FIELD, "mt-1 min-h-[72px] py-2")}
                  placeholder="Reusable scope for recurring estimate types…"
                  minHeight={72}
                  maxHeight={220}
                />
              </label>
              <label className="block text-xs font-medium text-[var(--neo-text-secondary)]">
                Category
                <Input
                  value={draft.category}
                  onChange={(event) => setDraft((d) => ({ ...d, category: event.target.value }))}
                  className={cn(FIELD, "mt-1")}
                  placeholder="Remodel"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--neo-text-secondary)]">
                Default Tax Rate
                <Input
                  value={draft.defaultTaxRate}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, defaultTaxRate: event.target.value }))
                  }
                  type="number"
                  min={0}
                  step="0.01"
                  className={cn(FIELD, "mt-1")}
                  placeholder="Optional"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--neo-text-secondary)]">
                Default Terms
                <EstimateAutoResizeTextarea
                  value={draft.defaultTerms}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, defaultTerms: event.target.value }))
                  }
                  className={cn(FIELD, "mt-1 min-h-[96px] py-2")}
                  placeholder="Payment terms or reusable proposal notes…"
                  minHeight={96}
                  maxHeight={260}
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--neo-text-primary)]">
                    Scope Sections
                  </h3>
                  <p className="text-xs text-[var(--neo-text-tertiary)]">
                    Sections and line items copied into new estimates.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={SECONDARY_ACTION}
                  onClick={addSection}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Section
                </Button>
              </div>
              <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                {draft.sections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    className="rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={section.title}
                        onChange={(event) =>
                          updateSection(section.id, { title: event.target.value })
                        }
                        className={cn(FIELD, "h-9")}
                        aria-label={`Template section ${sectionIndex + 1} title`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-rose-300"
                        onClick={() => removeSection(section.id)}
                        aria-label={`Remove ${section.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {section.items.map((item, itemIndex) => (
                        <div
                          key={item.id}
                          className="rounded-md border border-white/[0.04] bg-black/10 p-2"
                        >
                          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]">
                            <Input
                              value={item.title}
                              onChange={(event) =>
                                updateItem(section.id, item.id, { title: event.target.value })
                              }
                              className={FIELD}
                              placeholder="Line item title"
                              aria-label={`Template item ${itemIndex + 1} title`}
                            />
                            <Input
                              value={item.qty}
                              type="number"
                              min={0}
                              step="0.01"
                              onChange={(event) =>
                                updateItem(section.id, item.id, {
                                  qty: Number(event.target.value) || 0,
                                })
                              }
                              className={FIELD}
                              aria-label={`Template item ${itemIndex + 1} quantity`}
                            />
                            <Input
                              value={item.unitPrice}
                              type="number"
                              min={0}
                              step="0.01"
                              onChange={(event) =>
                                updateItem(section.id, item.id, {
                                  unitPrice: Number(event.target.value) || 0,
                                })
                              }
                              className={FIELD}
                              aria-label={`Template item ${itemIndex + 1} unit price`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 shrink-0 text-rose-300"
                              onClick={() => removeItem(section.id, item.id)}
                              aria-label={`Remove ${item.title || "line item"}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <EstimateAutoResizeTextarea
                            value={item.description}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                description: event.target.value,
                              })
                            }
                            className={cn(FIELD, "mt-2 min-h-[60px] py-2 text-sm")}
                            placeholder="Line item description…"
                            minHeight={60}
                            maxHeight={240}
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-[var(--neo-gold-soft)]"
                      onClick={() => addItem(section.id)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add line item
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={PRIMARY_ACTION}
              onClick={saveDraft}
              disabled={busy || !draft.name.trim()}
              data-testid="estimate-template-save"
            >
              {busy ? "Saving…" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
