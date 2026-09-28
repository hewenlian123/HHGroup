export const PROJECT_WORKSPACE_TABS = [
  { key: "overview", label: "Overview", mobile: true },
  { key: "change-orders", label: "Change Orders", mobile: true },
  { key: "documents", label: "Documents", mobile: true },
  { key: "financial", label: "Financials", mobile: true },
  { key: "people", label: "People", mobile: false },
  { key: "closeout", label: "Closeout", mobile: false },
] as const;

export type WorkspaceTabKey = (typeof PROJECT_WORKSPACE_TABS)[number]["key"];
export type TabKey =
  | WorkspaceTabKey
  | "cost"
  | "budget"
  | "expenses"
  | "labor"
  | "subcontracts"
  | "bills"
  | "commission"
  | "work"
  | "activity"
  | "docs"
  | "tasks"
  | "schedule"
  | "punch"
  | "punch-list"
  | "photos"
  | "inspections"
  | "materials";

const aliases: Record<string, WorkspaceTabKey> = {
  cost: "financial",
  budget: "financial",
  expenses: "financial",
  labor: "financial",
  subcontracts: "financial",
  bills: "financial",
  commission: "financial",
  financials: "financial",
  docs: "documents",
  work: "overview",
  activity: "overview",
  tasks: "overview",
  schedule: "overview",
  punch: "overview",
  "punch-list": "overview",
  photos: "overview",
  inspections: "overview",
  materials: "overview",
};

export function normalizeWorkspaceTab(value: string): WorkspaceTabKey {
  const key = value.toLowerCase();
  return (
    PROJECT_WORKSPACE_TABS.find((tab) => tab.key === key)?.key ??
    (Object.hasOwn(aliases, key) ? aliases[key] : "overview")
  );
}
