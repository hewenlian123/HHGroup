"use client";

import * as React from "react";
import { PageLayout, PageHeader } from "@/components/base";
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
import { cn } from "@/lib/utils";

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

function photoUrl(path: string): string {
  return `/api/materials/catalog/photo?path=${encodeURIComponent(path)}`;
}

export default function MaterialCatalogPage() {
  const [materials, setMaterials] = React.useState<MaterialRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [form, setForm] = React.useState({
    category: "",
    material_name: "",
    supplier: "",
    cost: "",
    photo_url: null as string | null,
    description: "",
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const openModal = () => {
    setForm({
      category: "",
      material_name: "",
      supplier: "",
      cost: "",
      photo_url: null,
      description: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          title="Material Catalog"
          description="Standard materials library."
          actions={
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openModal}>
              + Add Material
            </Button>
          }
        />
      }
    >
      <div className="max-w-5xl space-y-3">
        <div className="border border-border/60 rounded-sm overflow-hidden">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error && materials.length === 0 ? (
            <div className="py-10 text-center text-sm text-destructive">{error}</div>
          ) : materials.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No materials yet. Add one to get started.</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-12 py-2 px-2 sm:px-3" aria-label="Photo" />
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Material name</th>
                  <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-right py-2 px-2 sm:px-3 font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors">
                    <td className="py-2 px-2 sm:px-3">
                      {m.photo_url ? (
                        <a
                          href={photoUrl(m.photo_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-10 h-10 rounded-sm border border-border/60 overflow-hidden bg-muted/30"
                        >
                          <img
                            src={photoUrl(m.photo_url)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ) : (
                        <span className="block w-10 h-10 rounded-sm border border-border/60 bg-muted/30" aria-hidden />
                      )}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-muted-foreground">{m.category || "—"}</td>
                    <td className="py-2 px-2 sm:px-3 font-medium">{m.material_name || "—"}</td>
                    <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">{m.supplier ?? "—"}</td>
                    <td className="py-2 px-2 sm:px-3 text-right tabular-nums text-muted-foreground">
                      {m.cost != null ? `$${Number(m.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Material</DialogTitle>
            <DialogDescription>Add a material to the catalog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Input
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Flooring, Paint"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Material name</label>
              <Input
                value={form.material_name}
                onChange={(e) => setForm((p) => ({ ...p, material_name: e.target.value }))}
                placeholder="Required"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <Input
                value={form.supplier}
                onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                placeholder="Optional"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cost</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
                placeholder="0.00"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {form.photo_url && <span className="text-xs text-muted-foreground">Uploaded</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional"
                rows={2}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSave} disabled={submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
