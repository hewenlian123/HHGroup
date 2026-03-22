"use client";

import { DataTable, type DataTableColumn } from "@/components/base";
import type { ChangeOrderItem } from "@/lib/data";

export function ChangeOrderLineItemsTable({ items }: { items: ChangeOrderItem[] }) {
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

  return <DataTable<ChangeOrderItem> columns={lineColumns} data={items} getRowId={(r) => r.id} />;
}
