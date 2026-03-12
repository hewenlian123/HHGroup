"use client";

import * as React from "react";
import { SectionHeader } from "@/components/base";
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
import type { ProjectMaterialSelectionWithMaterial } from "@/lib/data";
import type { MaterialCatalogRow } from "@/lib/data";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "Selected", label: "Selected" },
  { value: "Pending", label: "Pending" },
  { value: "Ordered", label: "Ordered" },
];

function photoUrl(path: string): string {
  return `/api/materials/catalog/photo?path=${encodeURIComponent(path)}`;
}

export function ProjectMaterialsTab({
  projectId,
  projectName,
  clientName,
  selections,
  catalog,
  onRefresh,
}: {
  projectId: string;
  projectName: string;
  clientName?: string;
  selections: ProjectMaterialSelectionWithMaterial[];
  catalog: MaterialCatalogRow[];
  onRefresh: () => void;
}) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    item: "",
    category: "",
    material_id: "",
    material_name: "",
    supplier: "",
    status: "Pending" as "Selected" | "Pending" | "Ordered",
    notes: "",
  });

  const openModal = () => {
    setForm({
      item: "",
      category: "",
      material_id: "",
      material_name: "",
      supplier: "",
      status: "Pending",
      notes: "",
    });
    setModalOpen(true);
    setMessage(null);
  };

  const handleMaterialSelect = (m: MaterialCatalogRow) => {
    setForm((p) => ({
      ...p,
      material_id: m.id,
      material_name: m.material_name,
      supplier: m.supplier ?? "",
      category: p.category || m.category,
    }));
  };

  const handleSave = async () => {
    if (!form.item.trim()) {
      setMessage("Item is required.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: form.item.trim(),
          category: form.category.trim() || null,
          material_id: form.material_id || null,
          material_name: form.material_name.trim() || form.item.trim(),
          supplier: form.supplier.trim() || null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to add");
      setModalOpen(false);
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to add.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePdf = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials/generate-pdf`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "PDF failed");
      onRefresh();
      setMessage("PDF saved to project documents.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PDF failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <p className={cn("text-sm", message.includes("saved") ? "text-green-600" : "text-red-600")}>{message}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <SectionHeader label="Material Selections" />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-sm" onClick={handleGeneratePdf} disabled={generating}>
            {generating ? "Generating…" : "Generate Material Selection PDF"}
          </Button>
          <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={openModal}>
            + Add Selection
          </Button>
        </div>
      </div>

      <div className="border border-border/60 rounded-sm overflow-hidden">
        {selections.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No selections yet. Add one from the catalog.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="w-10 py-2 px-2" aria-label="Photo" />
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Item</th>
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Category</th>
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Material</th>
                <th className="hidden sm:table-cell text-left py-2 px-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left py-2 px-2 sm:px-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {selections.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors">
                  <td className="py-2 px-2 sm:px-3">
                    {row.material_photo_url ? (
                      <a
                        href={photoUrl(row.material_photo_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-9 h-9 rounded-sm border border-border/60 overflow-hidden bg-muted/30"
                      >
                        <img src={photoUrl(row.material_photo_url)} alt="" className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <span className="block w-9 h-9 rounded-sm border border-border/60 bg-muted/30" aria-hidden />
                    )}
                  </td>
                  <td className="py-2 px-2 sm:px-3 font-medium">{row.item || "—"}</td>
                  <td className="py-2 px-2 sm:px-3 text-muted-foreground">{row.category || "—"}</td>
                  <td className="py-2 px-2 sm:px-3 text-muted-foreground">{row.material_name || "—"}</td>
                  <td className="hidden sm:table-cell py-2 px-3 text-muted-foreground">{row.supplier ?? "—"}</td>
                  <td className="py-2 px-2 sm:px-3">
                    <span
                      className={cn(
                        "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium",
                        row.status === "Ordered" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
                        row.status === "Selected" && "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
                        row.status === "Pending" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg rounded-sm border-border/60 p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Selection</DialogTitle>
            <DialogDescription>Select a material from the catalog or enter details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Item</label>
              <Input
                value={form.item}
                onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))}
                placeholder="e.g. Kitchen flooring"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Material from catalog</label>
              <select
                value={form.material_id}
                onChange={(e) => {
                  const m = catalog.find((c) => c.id === e.target.value);
                  if (m) handleMaterialSelect(m);
                  else setForm((p) => ({ ...p, material_id: "", material_name: "", supplier: "" }));
                }}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                <option value="">— Select or leave blank —</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.material_name} ({m.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Input
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="Optional"
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Material name</label>
              <Input
                value={form.material_name}
                onChange={(e) => setForm((p) => ({ ...p, material_name: e.target.value }))}
                placeholder="Filled from catalog or type"
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "Selected" | "Pending" | "Ordered" }))}
                className="mt-1 h-9 w-full rounded-sm border border-border/60 bg-background px-2.5 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button size="sm" className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90" onClick={handleSave} disabled={submitting}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
