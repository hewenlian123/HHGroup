"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
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
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const handleSaveDetails = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      await updateChangeOrderAction(changeOrderId, projectId, formData);
      syncRouterNonBlocking(router);
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
      syncRouterNonBlocking(router);
      form.reset();
    });
  };

  const handleDelete = (itemId: string) => {
    startTransition(async () => {
      await deleteChangeOrderItemAction(changeOrderId, projectId, itemId);
      syncRouterNonBlocking(router);
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
          <label
            htmlFor="change-order-edit-title"
            className="mb-1 block text-hh-metadata text-[var(--hh-text-secondary)]"
          >
            Title
          </label>
          <Input
            id="change-order-edit-title"
            name="title"
            defaultValue={changeOrder.title ?? ""}
            placeholder="Title"
            className="min-h-[44px] text-hh-body xl:min-h-8"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="change-order-edit-description"
            className="mb-1 block text-hh-metadata text-[var(--hh-text-secondary)]"
          >
            Description
          </label>
          <Input
            id="change-order-edit-description"
            name="description"
            defaultValue={changeOrder.description ?? ""}
            placeholder="Description"
            className="min-h-[44px] text-hh-body xl:min-h-8"
          />
        </div>
        <div>
          <label
            htmlFor="change-order-edit-amount"
            className="mb-1 block text-hh-metadata text-[var(--hh-text-secondary)]"
          >
            Amount (revenue)
          </label>
          <Input
            id="change-order-edit-amount"
            name="amount"
            type="number"
            step="0.01"
            defaultValue={changeOrder.amount ?? ""}
            placeholder="0"
            className="min-h-[44px] text-hh-body xl:min-h-8"
          />
        </div>
        <div>
          <label
            htmlFor="change-order-edit-cost-impact"
            className="mb-1 block text-hh-metadata text-[var(--hh-text-secondary)]"
          >
            Cost impact
          </label>
          <Input
            id="change-order-edit-cost-impact"
            name="costImpact"
            type="number"
            step="0.01"
            defaultValue={changeOrder.costImpact ?? ""}
            placeholder="0"
            className="min-h-[44px] text-hh-body xl:min-h-8"
          />
        </div>
        <div>
          <label
            htmlFor="change-order-edit-schedule-impact"
            className="mb-1 block text-hh-metadata text-[var(--hh-text-secondary)]"
          >
            Schedule impact (days)
          </label>
          <Input
            id="change-order-edit-schedule-impact"
            name="scheduleImpactDays"
            type="number"
            step="1"
            defaultValue={changeOrder.scheduleImpactDays ?? ""}
            placeholder="0"
            className="min-h-[44px] text-hh-body xl:min-h-8"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" className="min-h-[44px] xl:min-h-8" disabled={pending}>
            Save details
          </Button>
        </div>
      </form>
      <Divider />
      <SectionHeader
        label="Line items"
        action={
          <form
            onSubmit={handleAdd}
            className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:items-center"
          >
            <Input
              aria-label="Line item cost code"
              name="costCode"
              placeholder="Cost code"
              className="min-h-[44px] w-full text-hh-body xl:min-h-8 xl:w-24 xl:text-hh-metadata"
            />
            <Input
              aria-label="Line item description"
              name="description"
              placeholder="Description"
              className="min-h-[44px] min-w-0 text-hh-body sm:col-span-2 xl:min-h-8 xl:min-w-[120px] xl:text-hh-metadata"
            />
            <Input
              aria-label="Line item quantity"
              name="qty"
              type="number"
              step="any"
              placeholder="Qty"
              className="min-h-[44px] w-full text-hh-body xl:min-h-8 xl:w-16 xl:text-hh-metadata"
              defaultValue={1}
            />
            <Input
              aria-label="Line item unit"
              name="unit"
              placeholder="Unit"
              className="min-h-[44px] w-full text-hh-body xl:min-h-8 xl:w-14 xl:text-hh-metadata"
              defaultValue="EA"
            />
            <Input
              aria-label="Line item unit price"
              name="unitPrice"
              type="number"
              step="0.01"
              placeholder="Unit price"
              className="min-h-[44px] w-full text-hh-body xl:min-h-8 xl:w-24 xl:text-hh-metadata"
            />
            <Button
              type="submit"
              size="sm"
              className="min-h-[44px] text-hh-body xl:min-h-8 xl:text-hh-metadata"
              disabled={pending}
            >
              Add
            </Button>
            {validationError && (
              <span className="text-hh-metadata text-destructive">{validationError}</span>
            )}
          </form>
        }
      />
      <Divider />
      {items.length === 0 ? (
        <p className="py-6 text-hh-body text-[var(--hh-text-secondary)]">
          No line items. Add one above.
        </p>
      ) : (
        <div className="max-xl:[&>div:first-child]:!hidden max-xl:[&>div:nth-child(2)]:!grid xl:[&>div:first-child]:!block xl:[&>div:nth-child(2)]:!hidden">
          <DataTable<ChangeOrderItem>
            columns={lineColumns}
            data={items}
            getRowId={(r) => r.id}
            mobileTitleKey="description"
            rowActions={(row) => [
              {
                label: "Delete",
                onClick: () => handleDelete(row.id),
              },
            ]}
          />
        </div>
      )}
      <div className="mt-6 flex flex-col items-end gap-1 text-hh-body">
        <div className="flex gap-8">
          <span className="text-[var(--hh-text-secondary)]">Subtotal</span>
          <span className="num">${subtotal.toLocaleString()}</span>
        </div>
        <div className="flex gap-8 font-medium">
          <span className="text-[var(--hh-text-secondary)]">Total</span>
          <span className="num">${total.toLocaleString()}</span>
        </div>
      </div>
    </>
  );
}
