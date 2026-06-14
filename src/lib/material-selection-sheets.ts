export type MaterialSelectionSheetStatus = "draft" | "shared" | "approved";
export type MaterialSelectionItemStatus = "selected" | "approved" | "installed";

export type MaterialSelectionSheet = {
  id: string;
  selectionNumber: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  title: string;
  status: MaterialSelectionSheetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MaterialSelectionItem = {
  id: string;
  selectionId: string;
  areaName: string | null;
  category: string | null;
  itemName: string;
  brand: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  finish: string | null;
  imageUrl: string | null;
  notes: string | null;
  status: MaterialSelectionItemStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MaterialSelectionSheetWithItems = MaterialSelectionSheet & {
  items: MaterialSelectionItem[];
};

export type MaterialSelectionSheetDraft = {
  title: string;
  customerId?: string | null;
  projectId?: string | null;
  status?: MaterialSelectionSheetStatus;
  notes?: string | null;
};

export type MaterialSelectionItemDraft = {
  areaName?: string | null;
  category?: string | null;
  itemName: string;
  brand?: string | null;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  finish?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  status?: MaterialSelectionItemStatus;
};

export function formatMaterialSelectionStatus(status: MaterialSelectionSheetStatus): string {
  if (status === "shared") return "Shared";
  if (status === "approved") return "Approved";
  return "Draft";
}

export function formatMaterialSelectionItemStatus(status: MaterialSelectionItemStatus): string {
  if (status === "approved") return "Approved";
  if (status === "installed") return "Installed";
  return "Selected";
}
