"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { useTransition, useState, useCallback, type FormEvent } from "react";
import { SectionHeader, Divider, DataTable, type DataTableColumn } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addChangeOrderItemAction,
  deleteChangeOrderItemAction,
  updateChangeOrderAction,
} from "../../actions";
import type { ChangeOrderItem, ChangeOrder } from "@/lib/data";

export function ChangeOrderEditClient({
  projectId,
  changeOrderId,
  changeOrder,
  items,
  subtotal,
  total,
}: {
  projectId: string;
  changeOrderId: string;
  changeOrder: ChangeOrder;
  items: ChangeOrderItem[];
  subtotal: number;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useOnAppSync(
    useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const handleSaveDetails = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await updateChangeOrderAction(changeOrderId, projectId, formData);
      void syncRouterAndClients(router);
    });
  };

  const lineColumns: DataTableColumn<ChangeOrderItem>[] = [
    { key: "costCode", header: "Cost Code", cell: (r) => r.costCode },
    { key: "description", header: "Description", cell: (r) => r.description },
    { key: "qty", header: "Qty", numeric: true, cell: (r) => String(r.qty) },
    { key: "unit", header: "Unit", cell: (r) => r.unit },
    {
      key: "unitPrice",
      header: "Unit Price",
      numeric: true,
      cell: (r) => `$${r.unitPrice.toLocaleString()}`,
    },
    {
      key: "total",
      header: "Total",
      numeric: true,
      cell: (r) => `$${r.total.toLocaleString()}`,
    },
  ];

  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);
    const form = e.currentTarget;
    const costCode = (form.elements.namedItem("costCode") as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem("description") as HTMLInputElement).value.trim();
    const qty = Number((form.elements.namedItem("qty") as HTMLInputElement).value) || 0;
    const unit = (form.elements.namedItem("unit") as HTMLInputElement).value.trim() || "EA";
    const unitPrice = Number((form.elements.namedItem("unitPrice") as HTMLInputElement).value) || 0;
    if (!description) {
      setValidationError("Please enter a description.");
      return;
    }
    startTransition(async () => {
      await addChangeOrderItemAction(changeOrderId, projectId, {
        costCode: costCode || "",
        description,
        qty,
        unit,
        unitPrice,
      });
      void syncRouterAndClients(router);
      form.reset();
    });
  };

  const handleDelete = (itemId: string) => {
    startTransition(async () => {
      await deleteChangeOrderItemAction(changeOrderId, projectId, itemId);
      void syncRouterAndClients(router);
    });
  };

  return (
    <>
      <SectionHeader label="Details" />
      <form
        onSubmit={handleSaveDetails}
        className="mb-6 grid gap-3 rounded border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Title</label>
          <Input
            name="title"
            defaultValue={changeOrder.title ?? ""}
            placeholder="Title"
            className="h-8 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Description</label>
          <Input
            name="description"
            defaultValue={changeOrder.description ?? ""}
            placeholder="Description"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Amount (revenue)</label>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={changeOrder.amount ?? ""}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Cost impact</label>
          <Input
            name="costImpact"
            type="number"
            step="0.01"
            defaultValue={changeOrder.costImpact ?? ""}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Schedule impact (days)</label>
          <Input
            name="scheduleImpactDays"
            type="number"
            step="1"
            defaultValue={changeOrder.scheduleImpactDays ?? ""}
            placeholder="0"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending}>
            Save details
          </Button>
        </div>
      </form>
      <Divider />
      <SectionHeader
        label="Line items"
        action={
          <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
            <Input name="costCode" placeholder="Cost code" className="h-8 w-24 text-xs" />
            <Input
              name="description"
              placeholder="Description"
              className="h-8 min-w-[120px] text-xs"
            />
            <Input
              name="qty"
              type="number"
              step="any"
              placeholder="Qty"
              className="h-8 w-16 text-xs"
              defaultValue={1}
            />
            <Input name="unit" placeholder="Unit" className="h-8 w-14 text-xs" defaultValue="EA" />
            <Input
              name="unitPrice"
              type="number"
              step="0.01"
              placeholder="Unit price"
              className="h-8 w-24 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={pending}>
              Add
            </Button>
            {validationError && <span className="text-xs text-destructive">{validationError}</span>}
          </form>
        }
      />
      <Divider />
      {items.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No line items. Add one above.</p>
      ) : (
        <DataTable<ChangeOrderItem>
          columns={lineColumns}
          data={items}
          getRowId={(r) => r.id}
          rowActions={(row) => [
            {
              label: "Delete",
              onClick: () => handleDelete(row.id),
            },
          ]}
        />
      )}
      <div className="mt-6 flex flex-col items-end gap-1 text-sm">
        <div className="flex gap-8">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="num">${subtotal.toLocaleString()}</span>
        </div>
        <div className="flex gap-8 font-medium">
          <span className="text-muted-foreground">Total</span>
          <span className="num">${total.toLocaleString()}</span>
        </div>
      </div>
    </>
  );
}
