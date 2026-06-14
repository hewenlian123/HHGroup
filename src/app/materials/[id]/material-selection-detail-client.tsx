"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye, Plus, Printer } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTextarea,
  PageHeader,
  PageLayout,
  neoFormErrorClassName,
} from "@/components/base";
import { cn } from "@/lib/utils";
import {
  formatMaterialSelectionItemStatus,
  formatMaterialSelectionStatus,
  type MaterialSelectionItem,
  type MaterialSelectionItemStatus,
  type MaterialSelectionSheetWithItems,
} from "@/lib/material-selection-sheets";

type ItemForm = {
  areaName: string;
  category: string;
  itemName: string;
  brand: string;
  sku: string;
  size: string;
  color: string;
  finish: string;
  imageUrl: string;
  notes: string;
  status: MaterialSelectionItemStatus;
};

const EMPTY_ITEM_FORM: ItemForm = {
  areaName: "",
  category: "",
  itemName: "",
  brand: "",
  sku: "",
  size: "",
  color: "",
  finish: "",
  imageUrl: "",
  notes: "",
  status: "selected",
};

function sheetStatusVariant(status: MaterialSelectionSheetWithItems["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "shared") return "warning" as const;
  return "muted" as const;
}

function itemStatusVariant(status: MaterialSelectionItemStatus) {
  if (status === "installed") return "success" as const;
  if (status === "approved") return "warning" as const;
  return "muted" as const;
}

function groupItems(items: MaterialSelectionItem[]) {
  const groups = new Map<string, MaterialSelectionItem[]>();
  for (const item of items) {
    const area = item.areaName?.trim() || "Unassigned Area";
    const existing = groups.get(area) ?? [];
    existing.push(item);
    groups.set(area, existing);
  }
  return Array.from(groups.entries()).map(([area, areaItems]) => ({ area, items: areaItems }));
}

function specsForItem(item: MaterialSelectionItem): string[] {
  return [
    item.brand ? `Brand: ${item.brand}` : null,
    item.sku ? `SKU / Model: ${item.sku}` : null,
    item.size ? `Size: ${item.size}` : null,
    item.color ? `Color: ${item.color}` : null,
    item.finish ? `Finish: ${item.finish}` : null,
  ].filter(Boolean) as string[];
}

function AddItemField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <NeoFieldLabel htmlFor={id} required={required}>
        {label}
      </NeoFieldLabel>
      <NeoInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export function MaterialSelectionDetailClient({
  selection,
}: {
  selection: MaterialSelectionSheetWithItems;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(selection.items);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [form, setForm] = React.useState<ItemForm>(EMPTY_ITEM_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const groupedItems = React.useMemo(() => groupItems(items), [items]);

  const closeModal = React.useCallback(() => {
    setModalOpen(false);
    setForm(EMPTY_ITEM_FORM);
    setError(null);
    setSaving(false);
    setUploading(false);
  }, []);

  const saveItem = React.useCallback(async () => {
    if (!form.itemName.trim()) {
      setError("Material name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials/${selection.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as
        | { ok: true; item: MaterialSelectionItem }
        | { ok: false; message?: string };
      if (!data.ok) throw new Error(data.message || "Failed to add material item.");
      setItems((prev) => [...prev, data.item]);
      router.refresh();
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add material item.");
      setSaving(false);
    }
  }, [closeModal, form, router, selection.id]);

  const uploadImage = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/materials/upload", { method: "POST", body: formData });
      const data = (await res.json()) as
        | { ok: true; imageUrl: string }
        | { ok: false; message?: string };
      if (!data.ok) throw new Error(data.message || "Upload failed.");
      setForm((prev) => ({ ...prev, imageUrl: data.imageUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, []);

  return (
    <PageLayout
      divider={false}
      className="dark md:max-w-6xl"
      header={
        <PageHeader
          title={selection.title}
          description={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{selection.selectionNumber || "Draft"}</span>
              {selection.customerName ? <span>{selection.customerName}</span> : null}
              {selection.projectName ? <span>{selection.projectName}</span> : null}
            </span>
          }
          actions={
            <>
              <Button variant="outline" size="sm" className="rounded-sm" asChild>
                <Link href="/materials">
                  <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                  Back
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="rounded-sm" asChild>
                <Link href={`/materials/${selection.id}/preview`}>
                  <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                  Preview
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm"
                type="button"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-4 w-4" aria-hidden />
                Print
              </Button>
              <Button variant="outline" size="sm" className="rounded-sm" asChild>
                <Link href={`/api/materials/${selection.id}/pdf`}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  Download PDF
                </Link>
              </Button>
            </>
          }
        />
      }
    >
      <div className="space-y-4">
        <NeoPanel bodyClassName="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <NeoStatus
                  label={formatMaterialSelectionStatus(selection.status)}
                  variant={sheetStatusVariant(selection.status)}
                />
                <span className="text-xs text-[var(--neo-text-secondary)]">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </span>
              </div>
              {selection.notes ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--neo-text-secondary)]">
                  {selection.notes}
                </p>
              ) : null}
            </div>
            <Button type="button" className="rounded-sm" onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add Item
            </Button>
          </div>
        </NeoPanel>

        {groupedItems.length === 0 ? (
          <NeoPanel bodyClassName="p-6">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--neo-text-primary)]">
                  No material items yet
                </h2>
                <p className="mt-1 text-sm text-[var(--neo-text-secondary)]">
                  Add selected materials by area, such as bathrooms, kitchen, or living room.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-sm"
                onClick={() => setModalOpen(true)}
              >
                Add First Item
              </Button>
            </div>
          </NeoPanel>
        ) : (
          <div className="space-y-4">
            {groupedItems.map((group) => (
              <section
                key={group.area}
                data-testid={`material-area-${group.area}`}
                className="min-w-0 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-normal text-[var(--neo-text-secondary)]">
                    {group.area}
                  </h2>
                  <span className="text-xs tabular-nums text-[var(--neo-text-tertiary)]">
                    {group.items.length} item{group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {group.items.map((item) => {
                    const specs = specsForItem(item);
                    return (
                      <NeoMobileCard key={item.id} className="p-3">
                        <div className="flex min-w-0 gap-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- customer selection photos can be external or data URLs
                              <img
                                src={item.imageUrl}
                                alt={item.itemName}
                                className="h-full w-full object-contain"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.category ? (
                                <span className="rounded-sm border border-[var(--neo-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--neo-text-secondary)]">
                                  {item.category}
                                </span>
                              ) : null}
                              <NeoStatus
                                label={formatMaterialSelectionItemStatus(item.status)}
                                variant={itemStatusVariant(item.status)}
                              />
                            </div>
                            <p className="mt-2 break-words text-sm font-semibold text-[var(--neo-text-primary)]">
                              {item.itemName}
                            </p>
                            {specs.length > 0 ? (
                              <p className="mt-1 break-words text-xs leading-5 text-[var(--neo-text-secondary)]">
                                {specs.join(" · ")}
                              </p>
                            ) : null}
                            {item.notes ? (
                              <p className="mt-2 break-words text-xs leading-5 text-[var(--neo-text-secondary)]">
                                {item.notes}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </NeoMobileCard>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => (open ? setModalOpen(true) : closeModal())}>
        <NeoModal
          title="Add Material Item"
          description="Group selected materials by area."
          className="max-w-[680px]"
          footer={
            <>
              <Button variant="outline" size="sm" className="rounded-sm" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-sm"
                disabled={saving}
                onClick={() => void saveItem()}
              >
                {saving ? "Saving..." : "Save Item"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <NeoFormGrid>
              <AddItemField
                id="material-item-area"
                label="Area"
                value={form.areaName}
                onChange={(value) => setForm((prev) => ({ ...prev, areaName: value }))}
                placeholder="Master Bathroom"
              />
              <AddItemField
                id="material-item-category"
                label="Category"
                value={form.category}
                onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                placeholder="Tile"
              />
            </NeoFormGrid>

            <AddItemField
              id="material-item-name"
              label="Material name"
              value={form.itemName}
              onChange={(value) => setForm((prev) => ({ ...prev, itemName: value }))}
              required
              placeholder="White Porcelain 24x48"
            />

            <NeoFormGrid>
              <AddItemField
                id="material-item-brand"
                label="Brand"
                value={form.brand}
                onChange={(value) => setForm((prev) => ({ ...prev, brand: value }))}
              />
              <AddItemField
                id="material-item-sku"
                label="SKU / Model"
                value={form.sku}
                onChange={(value) => setForm((prev) => ({ ...prev, sku: value }))}
              />
              <AddItemField
                id="material-item-size"
                label="Size"
                value={form.size}
                onChange={(value) => setForm((prev) => ({ ...prev, size: value }))}
              />
              <AddItemField
                id="material-item-color"
                label="Color"
                value={form.color}
                onChange={(value) => setForm((prev) => ({ ...prev, color: value }))}
              />
              <AddItemField
                id="material-item-finish"
                label="Finish"
                value={form.finish}
                onChange={(value) => setForm((prev) => ({ ...prev, finish: value }))}
              />
              <div className="space-y-1.5">
                <NeoFieldLabel htmlFor="material-item-status">Item status</NeoFieldLabel>
                <NeoSelect
                  id="material-item-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as MaterialSelectionItemStatus,
                    }))
                  }
                >
                  <option value="selected">Selected</option>
                  <option value="approved">Approved</option>
                  <option value="installed">Installed</option>
                </NeoSelect>
              </div>
            </NeoFormGrid>

            <AddItemField
              id="material-item-image-url"
              label="Image URL"
              value={form.imageUrl}
              onChange={(value) => setForm((prev) => ({ ...prev, imageUrl: value }))}
              placeholder="Paste an image URL or upload path"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={uploadImage}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading..." : "Upload image"}
              </Button>
              {form.imageUrl ? (
                <span className="text-xs text-[var(--neo-text-secondary)]">Image attached</span>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="material-item-notes">Item notes</NeoFieldLabel>
              <NeoTextarea
                id="material-item-notes"
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {error ? <p className={cn(neoFormErrorClassName, "mt-1")}>{error}</p> : null}
          </div>
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}
