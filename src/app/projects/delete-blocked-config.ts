/**
 * Shared config for "Cannot delete project" dialog: related data keys, labels, and optional view links.
 * Used by projects list and project detail when delete is blocked by usage or FK.
 */
export type DeleteBlockedCounts = Record<string, number>;

export const DELETE_BLOCKED_RELATED_CONFIG: {
  key: string;
  label: string;
  viewPath?: string;
}[] = [
  { key: "project_tasks", label: "Tasks", viewPath: "/tasks" },
  { key: "expenses", label: "Expenses", viewPath: "/financial/expenses" },
  { key: "invoices", label: "Invoices", viewPath: "/financial/invoices" },
  { key: "labor_entries", label: "Labor Entries", viewPath: "/labor" },
  { key: "punch_list", label: "Punch List", viewPath: "/punch-list" },
  { key: "site_photos", label: "Site Photos", viewPath: "/site-photos" },
  { key: "project_change_orders", label: "Change Orders", viewPath: "/change-orders" },
  { key: "bills", label: "Bills", viewPath: "/bills" },
  { key: "worker_receipts", label: "Worker Receipts", viewPath: "/labor/receipts" },
  { key: "subcontracts", label: "Subcontracts", viewPath: "/projects" },
  { key: "materials", label: "Materials", viewPath: "/materials/catalog" },
  { key: "activity_logs", label: "Activity logs" },
  { key: "estimates", label: "Estimates" },
  { key: "commitments", label: "Commitments" },
  { key: "project_schedule", label: "Schedule" },
  { key: "inspection_log", label: "Inspection log" },
  { key: "subcontract_bills", label: "Subcontract bills" },
  { key: "documents", label: "Documents" },
  { key: "deposits", label: "Deposits" },
  { key: "project_commissions", label: "Commissions" },
  { key: "payments_received", label: "Payments received" },
];

const LABEL_BY_KEY = new Map(DELETE_BLOCKED_RELATED_CONFIG.map((c) => [c.key, c.label]));
const VIEW_PATH_BY_KEY = new Map(
  DELETE_BLOCKED_RELATED_CONFIG.filter((c) => c.viewPath != null).map((c) => [c.key, c.viewPath!])
);

export function getLabelForKey(key: string): string {
  return LABEL_BY_KEY.get(key) ?? key.replace(/_/g, " ");
}

export function getViewPathForKey(key: string): string | undefined {
  return VIEW_PATH_BY_KEY.get(key);
}

/** Build the list of related data names for the force-delete confirmation (e.g. "Invoices、Worker Receipts"). */
export function getRelatedLabelsList(counts: DeleteBlockedCounts): string[] {
  const labels: string[] = [];
  for (const { key } of DELETE_BLOCKED_RELATED_CONFIG) {
    const n = counts[key] ?? 0;
    if (n > 0) labels.push(getLabelForKey(key));
  }
  for (const key of Object.keys(counts)) {
    if ((counts[key] ?? 0) > 0 && !LABEL_BY_KEY.has(key)) labels.push(getLabelForKey(key));
  }
  return labels;
}
