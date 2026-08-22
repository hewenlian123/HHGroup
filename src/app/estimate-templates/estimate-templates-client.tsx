"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit3,
  FileText,
  GripVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
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
import { EB, ebGlassPanel, ebInput } from "@/app/estimates/_components/estimate-builder-ui";
import { formatEstimateCurrency } from "@/app/estimates/_components/estimate-currency";
import {
  ScopeSectionCollapsibleBody,
  ScopeSectionHeader,
} from "@/app/estimates/_components/estimate-line-items-local";
import { ProposalScopeWorkCard } from "@/app/estimates/_components/proposal-scope-work-card";
import "@/app/estimates/_components/estimate-builder-glass.css";
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
  "hh-focus-ring hh-type-text-entry h-hh-control-comfortable rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none placeholder:text-[var(--hh-text-tertiary)] focus-visible:border-[var(--hh-border-strong)]";
const PRIMARY_ACTION =
  "hh-focus-ring rounded-hh-compact border border-transparent bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] shadow-none hover:opacity-90";
const SECONDARY_ACTION =
  "rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l2-operational-surface)]";

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

function draftItemTotal(item: TemplateDraftItem): number {
  const qty = Number.isFinite(item.qty) ? item.qty : 0;
  const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return qty * unitPrice;
}

function draftSectionSubtotal(section: TemplateDraftSection): number {
  return section.items.reduce((sum, item) => sum + draftItemTotal(item), 0);
}

export function EstimateTemplatesClient({ templates }: { templates: EstimateTemplateRecord[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<TemplateDraft>(() => emptyDraft());
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});
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
    setCollapsedSections({});
    setDialogOpen(true);
  };

  const openEdit = (template: EstimateTemplateRecord): void => {
    setDraft(draftFromTemplate(template));
    setCollapsedSections({});
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

  const toggleSectionCollapsed = (sectionId: string): void => {
    setCollapsedSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  };

  const lineNumberByItemId = React.useMemo(() => {
    const map = new Map<string, number>();
    let lineNumber = 1;
    draft.sections.forEach((section) => {
      section.items.forEach((item) => {
        map.set(item.id, lineNumber);
        lineNumber += 1;
      });
    });
    return map;
  }, [draft.sections]);

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
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]"
            aria-hidden
          />
          <Input
            data-testid="estimate-template-search"
            aria-label="Search estimate templates"
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
            className="transition-colors hover:border-[var(--hh-border-strong)]"
            bodyClassName="p-4"
          >
            <div className="flex min-h-[188px] flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-hh-status text-[var(--hh-text-tertiary)]">
                    {template.category}
                  </p>
                  <h2 className="mt-1 truncate text-base font-semibold text-[var(--hh-text-primary)]">
                    {template.name}
                  </h2>
                  {template.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--hh-text-secondary)]">
                      {template.description}
                    </p>
                  ) : null}
                </div>
                <FileText
                  className="h-5 w-5 shrink-0 text-[var(--hh-text-secondary)]"
                  aria-hidden
                />
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 text-xs text-[var(--hh-text-tertiary)]">
                <span>
                  <strong className="block text-sm text-[var(--hh-text-primary)]">
                    {template.templateData.sections.length}
                  </strong>
                  sections
                </span>
                <span>
                  <strong className="block text-sm text-[var(--hh-text-primary)]">
                    {templateItemCount(template)}
                  </strong>
                  items
                </span>
                <span>
                  <strong className="block text-sm text-[var(--hh-text-primary)] tabular-nums">
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
                className="border-t border-[var(--hh-border)] hover:bg-[var(--hh-l2-operational-surface)]"
                data-testid="estimate-template-row"
              >
                <td className="px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--hh-text-primary)]">
                        {template.name}
                      </span>
                      {template.isArchived ? (
                        <NeoStatus label="Archived" variant="muted" className="h-5" />
                      ) : null}
                    </div>
                    {template.description ? (
                      <p className="mt-0.5 max-w-xl text-xs text-[var(--hh-text-tertiary)]">
                        {template.description}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-[var(--hh-text-secondary)]">{template.category}</td>
                <td className="px-3 py-3 text-[var(--hh-text-secondary)]">
                  {template.templateData.sections.length} sections · {templateItemCount(template)}{" "}
                  items
                </td>
                <td className="px-3 py-3 text-[var(--hh-text-secondary)] tabular-nums">
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
                        className="min-w-[210px] rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-hh-1 text-[var(--hh-text-primary)] shadow-floating"
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
                          className="text-[var(--hh-danger)] focus:text-[var(--hh-danger)]"
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
                  className="px-3 py-10 text-center text-sm text-[var(--hh-text-tertiary)]"
                >
                  No matching templates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </NeoTable>
      </NeoPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="flex max-h-[92vh] max-w-[min(1180px,calc(100vw-1rem))] flex-col overflow-hidden p-0"
          data-testid="estimate-template-dialog"
        >
          <DialogHeader>
            <div className="px-5 pt-5 sm:px-6">
              <DialogTitle className={EB.pageTitle}>
                {draft.id ? "Edit Template" : "Create Template"}
              </DialogTitle>
              <DialogDescription className="mt-hh-1 text-hh-body text-[var(--hh-text-secondary)]">
                Build reusable proposal sections and line items. Customer, project, payments, and
                invoices are never stored in templates.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="eb-neo-scroll-region min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="estimate-builder estimate-builder-new grid gap-4 lg:grid-cols-[minmax(16rem,0.78fr)_minmax(0,1.72fr)]">
              <div className="space-y-3">
                <div className={ebGlassPanel("space-y-3")}>
                  <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
                    Template Name
                    <Input
                      data-testid="estimate-template-name"
                      value={draft.name}
                      onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
                      className={cn(FIELD, "mt-1")}
                      placeholder="Kitchen Remodel"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
                    Description
                    <EstimateAutoResizeTextarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, description: event.target.value }))
                      }
                      className={cn(FIELD, "mt-1 min-h-[72px] w-full py-2")}
                      placeholder="Reusable scope for recurring estimate types…"
                      minHeight={72}
                      maxHeight={220}
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
                    Category
                    <Input
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, category: event.target.value }))
                      }
                      className={cn(FIELD, "mt-1")}
                      placeholder="Remodel"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
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
                  <label className="block text-xs font-medium text-[var(--hh-text-secondary)]">
                    Default Terms
                    <EstimateAutoResizeTextarea
                      value={draft.defaultTerms}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, defaultTerms: event.target.value }))
                      }
                      className={cn(FIELD, "mt-1 min-h-[96px] w-full py-2")}
                      placeholder="Payment terms or reusable proposal notes…"
                      minHeight={96}
                      maxHeight={260}
                    />
                  </label>
                </div>
              </div>

              <div className={cn(ebGlassPanel("eb-scope-work-panel"), "min-w-0")}>
                <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className={EB.scopeHeading}>Scope of work</h3>
                    <p className={EB.scopeSubtitle}>Template sections and line totals</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("!h-9 !min-h-9", EB.actionSecondary)}
                    onClick={addSection}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Section
                  </Button>
                </div>

                {draft.sections.length === 0 ? (
                  <div className={EB.scopeEmpty}>
                    <p className={cn(EB.scopeEmptyMessage, "mb-3")}>No sections yet.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("!h-11 !min-h-11", EB.actionSecondary)}
                      onClick={addSection}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Section
                    </Button>
                  </div>
                ) : (
                  <div className="eb-scope-sections-list flex flex-col">
                    {draft.sections.map((section, sectionIndex) => {
                      const collapsed = collapsedSections[section.id] === true;
                      const sectionSubtotal = draftSectionSubtotal(section);
                      return (
                        <div key={section.id} className={EB.scopeSectionSortable}>
                          <ScopeSectionHeader
                            code={section.id}
                            catalogName={section.title || `Section ${sectionIndex + 1}`}
                            displayName={section.title}
                            itemCount={section.items.length}
                            sectionSubtotal={sectionSubtotal}
                            collapsed={collapsed}
                            onToggleCollapse={() => toggleSectionCollapsed(section.id)}
                            onDisplayNameChange={(name) =>
                              updateSection(section.id, { title: name })
                            }
                            dragHandle={
                              <span
                                className={cn(
                                  EB.scopeSectionDragHandle,
                                  "cursor-default opacity-50"
                                )}
                                aria-hidden
                              >
                                <GripVertical className="h-4 w-4" strokeWidth={1.75} />
                              </span>
                            }
                            titleSlot={
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <Input
                                  value={section.title}
                                  onChange={(event) =>
                                    updateSection(section.id, { title: event.target.value })
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  className={ebInput(
                                    "hh-focus-ring h-7 min-h-7 min-w-[8rem] border-0 bg-transparent px-0 text-hh-panel-title text-[var(--hh-text-primary)] shadow-none"
                                  )}
                                  placeholder={`Section ${sectionIndex + 1}`}
                                  aria-label={`Template section ${sectionIndex + 1} title`}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    EB.lineItemMoreTrigger,
                                    "h-7 min-h-7 w-7 min-w-7 text-[var(--hh-danger)] opacity-75 hover:opacity-100"
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeSection(section.id);
                                  }}
                                  aria-label={`Remove ${section.title || "section"}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            }
                          />
                          <ScopeSectionCollapsibleBody collapsed={collapsed}>
                            <div className="eb-scope-section-lines flex flex-col">
                              {section.items.map((item, itemIndex) => (
                                <div key={item.id} className={EB.lineItemCard}>
                                  <ProposalScopeWorkCard
                                    lineItemGridLayout
                                    title={item.title}
                                    description={item.description}
                                    onTitleChange={(value) =>
                                      updateItem(section.id, item.id, { title: value })
                                    }
                                    onDescriptionChange={(value) =>
                                      updateItem(section.id, item.id, { description: value })
                                    }
                                    titlePlaceholder="Line item title"
                                    titleInputAriaLabel={`Template item ${
                                      lineNumberByItemId.get(item.id) ?? itemIndex + 1
                                    } title`}
                                    descriptionEditorAriaLabel={`Template item ${
                                      lineNumberByItemId.get(item.id) ?? itemIndex + 1
                                    } description`}
                                    lineIndex={lineNumberByItemId.get(item.id) ?? itemIndex + 1}
                                    inlinePricing={
                                      <>
                                        <div
                                          className={cn(
                                            EB.lineFieldStackContents,
                                            EB.linePricingQty
                                          )}
                                        >
                                          <span className={cn(EB.readLabel, EB.lineQtyLabel)}>
                                            Qty
                                          </span>
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
                                            className={ebInput(
                                              `h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineQtyInput}`
                                            )}
                                            aria-label={`Template item ${
                                              lineNumberByItemId.get(item.id) ?? itemIndex + 1
                                            } quantity`}
                                          />
                                        </div>
                                        <div
                                          className={cn(
                                            EB.lineFieldStackContents,
                                            EB.linePricingUnit
                                          )}
                                        >
                                          <span className={cn(EB.readLabel, EB.lineUnitLabel)}>
                                            Unit price
                                          </span>
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
                                            className={ebInput(
                                              `h-8 min-h-8 w-full px-2 ${EB.inputNumeric} ${EB.lineUnitInput}`
                                            )}
                                            aria-label={`Template item ${
                                              lineNumberByItemId.get(item.id) ?? itemIndex + 1
                                            } unit price`}
                                          />
                                        </div>
                                        <div
                                          className={cn(
                                            EB.linePricingTotalCol,
                                            EB.lineTotalActionArea
                                          )}
                                        >
                                          <div className={EB.lineTotalBlock}>
                                            <span className={cn(EB.readLabel, EB.lineTotalLabel)}>
                                              Total
                                            </span>
                                            <div
                                              className={cn(
                                                EB.linePricingTotal,
                                                EB.lineTotalAmount
                                              )}
                                            >
                                              <span className={cn(EB.lineTotal, "leading-none")}>
                                                {formatEstimateCurrency(draftItemTotal(item))}
                                              </span>
                                            </div>
                                          </div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className={EB.lineItemMoreTrigger}
                                            onClick={() => removeItem(section.id, item.id)}
                                            aria-label={`Remove ${item.title || "line item"}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </>
                                    }
                                  />
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn("mt-2 w-fit", EB.addLineLink)}
                                onClick={() => addItem(section.id)}
                              >
                                <Plus className="mr-1.5 h-4 w-4" />
                                Add line
                              </Button>
                            </div>
                          </ScopeSectionCollapsibleBody>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] px-hh-5 py-hh-4 sm:px-hh-6">
            <Button
              type="button"
              variant="ghost"
              className={EB.portalGhostButton}
              onClick={() => setDialogOpen(false)}
            >
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
