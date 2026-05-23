"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  EmptyState,
  LoadingState,
  NeoAmount,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoSelect,
  NeoTable,
  NeoTextarea,
  NeoToolbar,
  PageLayout,
  PageHeader,
  neoFormErrorClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Dialog } from "@/components/ui/dialog";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
import { Package, Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

type MaterialRow = {
  id: string;
  category: string;
  material_name: string;
  supplier: string | null;
  cost: number | null;
  photo_url: string | null;
  description: string | null;
  created_at: string;
};

const EMPTY_FORM = {
  category: "",
  material_name: "",
  supplier: "",
  cost: "",
  photo_url: null as string | null,
  description: "",
};

function photoUrl(path: string): string {
  return `/api/materials/catalog/photo?path=${encodeURIComponent(path)}`;
}

function revokePreviewIfBlob(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export default function MaterialCatalogPage() {
  const [materials, setMaterials] = React.useState<MaterialRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingMaterial, setEditingMaterial] = React.useState<MaterialRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [categoryFilter, setCategoryFilter] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/materials/catalog");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setMaterials(data.materials ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  React.useEffect(() => {
    if (!modalOpen || !editingMaterial) return;
    setForm({
      category: editingMaterial.category ?? "",
      material_name: editingMaterial.material_name ?? "",
      supplier: editingMaterial.supplier ?? "",
      cost: editingMaterial.cost != null ? String(editingMaterial.cost) : "",
      photo_url: editingMaterial.photo_url,
      description: editingMaterial.description ?? "",
    });
  }, [modalOpen, editingMaterial]);

  React.useEffect(() => {
    if (!modalOpen || !editingMaterial) return;
    if (editingMaterial.photo_url) {
      setPreviewUrl(photoUrl(editingMaterial.photo_url));
    } else {
      setPreviewUrl(null);
    }
  }, [modalOpen, editingMaterial]);

  React.useEffect(() => {
    return () => {
      revokePreviewIfBlob(previewUrl);
    };
  }, [previewUrl]);

  const handleModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setEditingMaterial(null);
      setForm({ ...EMPTY_FORM });
      setPreviewUrl(null);
      setError(null);
    }
  };

  const openModal = () => {
    setEditingMaterial(null);
    setForm({ ...EMPTY_FORM });
    setPreviewUrl(null);
    setError(null);
    setModalOpen(true);
  };

  const handleEdit = (material: MaterialRow) => {
    setEditingMaterial(material);
    setError(null);
    setModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl((prev) => {
      revokePreviewIfBlob(prev);
      return URL.createObjectURL(file);
    });
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/materials/catalog/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Upload failed");
      setForm((p) => ({ ...p, photo_url: data.path }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.material_name.trim()) {
      setError("Material name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editingMaterial) {
        const res = await fetch("/api/materials/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingMaterial.id,
            category: form.category.trim() || "Uncategorized",
            material_name: form.material_name.trim(),
            supplier: form.supplier.trim() || null,
            cost: form.cost !== "" ? Number(form.cost) : null,
            photo_url: form.photo_url,
            description: form.description.trim() || null,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || "Failed to update");
      } else {
        const res = await fetch("/api/materials/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: form.category.trim() || "Uncategorized",
            material_name: form.material_name.trim(),
            supplier: form.supplier.trim() || null,
            cost: form.cost !== "" ? Number(form.cost) : null,
            photo_url: form.photo_url,
            description: form.description.trim() || null,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || "Failed to create");
      }
      handleModalOpenChange(false);
      setSubmitting(false);
      void load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : editingMaterial ? "Failed to update." : "Failed to create."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const m of materials) {
      const c = (m.category ?? "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  const filteredMaterials = React.useMemo(() => {
    let list = materials;
    if (categoryFilter) {
      list = list.filter((m) => (m.category ?? "").trim() === categoryFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          (m.material_name ?? "").toLowerCase().includes(q) ||
          (m.category ?? "").toLowerCase().includes(q) ||
          (m.supplier ?? "").toLowerCase().includes(q) ||
          (m.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [materials, categoryFilter, searchQuery]);

  const activeDrawerFilterCount = categoryFilter ? 1 : 0;

  return (
    <PageLayout
      divider={false}
      className={cn("dark md:max-w-5xl", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Material Catalog"
              description="Standard materials library."
              actions={
                <Button size="sm" onClick={openModal}>
                  + Add Material
                </Button>
              }
            />
          </div>
          <div className="md:hidden">
            <MobileListHeader
              title="Material Catalog"
              fab={<MobileFabButton ariaLabel="Add material" onClick={openModal} />}
            />
          </div>
        </>
      }
    >
      <div className="w-full space-y-3">
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <NeoInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search materials…"
                className="h-10 pl-8 text-sm"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <NeoFieldLabel>Category</NeoFieldLabel>
            <NeoSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NeoSelect>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        <NeoToolbar className="hidden flex-wrap items-end gap-3 md:flex">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <NeoInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search materials…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Category</NeoFieldLabel>
            <NeoSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 min-w-[160px]"
            >
              <option value="">All</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NeoSelect>
          </div>
        </NeoToolbar>

        <div>
          {loading ? (
            <LoadingState text="Loading materials..." />
          ) : error && materials.length === 0 ? (
            <EmptyState title="Material catalog unavailable" description={error} />
          ) : materials.length === 0 ? (
            <>
              <MobileEmptyState
                icon={<Package className="h-8 w-8 opacity-80" aria-hidden />}
                message="No materials yet. Add one to get started."
                action={
                  <Button size="sm" variant="outline" onClick={openModal}>
                    Add material
                  </Button>
                }
              />
              <EmptyState
                title="No materials yet"
                description="Add one standard material to get started."
                action={
                  <Button size="sm" onClick={openModal}>
                    Add material
                  </Button>
                }
                className="hidden md:block"
              />
            </>
          ) : filteredMaterials.length === 0 ? (
            <EmptyState title="No matches" description="Try a different material search." />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {filteredMaterials.map((m) => (
                  <NeoMobileCard asChild key={m.id}>
                    <button
                      type="button"
                      onClick={() => handleEdit(m)}
                      className="flex min-h-[68px] w-full items-center gap-3 p-3 text-left"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)]">
                        {m.photo_url ? (
                          <img
                            src={photoUrl(m.photo_url)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
                          {m.material_name || "—"}
                        </p>
                        <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                          {(m.category || "—") + (m.supplier ? ` · ${m.supplier}` : "")}
                        </p>
                      </div>
                      <NeoAmount className="shrink-0 text-sm">
                        {m.cost != null
                          ? `$${Number(m.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </NeoAmount>
                    </button>
                  </NeoMobileCard>
                ))}
              </div>
              <NeoTable className="hidden md:block" tableClassName="min-w-[860px] lg:min-w-0">
                <thead>
                  <tr>
                    <th className="h-9 w-12 px-3" aria-label="Photo" />
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                      Category
                    </th>
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                      Material name
                    </th>
                    <th
                      className={cn(
                        "hidden h-9 px-3 text-left align-middle sm:table-cell",
                        TYPO.tableHeader
                      )}
                    >
                      Supplier
                    </th>
                    <th className={cn("h-9 px-3 text-right align-middle", TYPO.tableHeader)}>
                      Cost
                    </th>
                    <th
                      className={cn("h-9 w-[140px] px-3 text-right align-middle", TYPO.tableHeader)}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((m) => (
                    <tr key={m.id} className={listTableRowStaticClassName}>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle">
                        {m.photo_url ? (
                          <a
                            href={photoUrl(m.photo_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-10 w-10 overflow-hidden rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)]"
                          >
                            <img
                              src={photoUrl(m.photo_url)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : (
                          <span
                            className="block h-10 w-10 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)]"
                            aria-hidden
                          />
                        )}
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-[var(--neo-text-secondary)]">
                        <button
                          type="button"
                          onClick={() => handleEdit(m)}
                          className="w-full cursor-pointer bg-transparent p-0 text-left font-inherit text-inherit hover:underline"
                        >
                          {m.category || "—"}
                        </button>
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium text-[var(--neo-text-primary)]">
                        <button
                          type="button"
                          onClick={() => handleEdit(m)}
                          className="w-full cursor-pointer bg-transparent p-0 text-left font-inherit text-inherit hover:underline"
                        >
                          {m.material_name || "—"}
                        </button>
                      </td>
                      <td className="hidden h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] text-[var(--neo-text-secondary)] sm:table-cell">
                        {m.supplier ?? "—"}
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle">
                        <NeoAmount className="text-[13px]">
                          {m.cost != null
                            ? `$${Number(m.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </NeoAmount>
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="btn-outline-ghost rounded-sm h-8 px-2"
                          onClick={() => handleEdit(m)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </NeoTable>
            </>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={handleModalOpenChange}>
        <NeoModal
          title={editingMaterial ? "Edit Material" : "Add Material"}
          description="Add a material to the catalog."
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm"
                onClick={() => handleModalOpenChange(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={submitting}>
                <SubmitSpinner loading={submitting} className="mr-2" />
                {submitting ? "Saving…" : editingMaterial ? "Save" : "Add"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <NeoFieldLabel>Category</NeoFieldLabel>
              <NeoInput
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Flooring, Paint"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Material name</NeoFieldLabel>
              <NeoInput
                value={form.material_name}
                onChange={(e) => setForm((p) => ({ ...p, material_name: e.target.value }))}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Supplier</NeoFieldLabel>
              <NeoInput
                value={form.supplier}
                onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Cost</NeoFieldLabel>
              <NeoInput
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Photo</NeoFieldLabel>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {form.photo_url && (
                  <span className="text-xs text-[var(--neo-text-secondary)]">Uploaded</span>
                )}
              </div>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mt-2 h-40 w-full rounded-lg border border-[var(--neo-border)] object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Description</NeoFieldLabel>
              <NeoTextarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </div>
            {error && <p className={neoFormErrorClassName}>{error}</p>}
          </div>
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}
