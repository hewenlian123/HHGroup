export const PROJECT_WORKSPACE_TABS = [
  { key: "overview", label: "Overview", mobile: true },
  { key: "schedule", label: "Schedule", mobile: true },
  { key: "tasks", label: "Tasks", mobile: true },
  { key: "punch-list", label: "Punch", mobile: false },
  { key: "photos", label: "Photos", mobile: true },
  { key: "inspections", label: "Inspections", mobile: false },
  { key: "materials", label: "Materials", mobile: false },
  { key: "change-orders", label: "Change Orders", mobile: false },
  { key: "documents", label: "Documents", mobile: false },
  { key: "financial", label: "Financials", mobile: false },
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
  | "docs";

const aliases: Record<string, WorkspaceTabKey> = {
  cost: "financial",
  budget: "financial",
  expenses: "financial",
  labor: "financial",
  subcontracts: "financial",
  bills: "financial",
  commission: "financial",
  financials: "financial",
  work: "tasks",
  activity: "tasks",
  docs: "documents",
  punch: "punch-list",
};

export function normalizeWorkspaceTab(value: string): WorkspaceTabKey {
  const key = value.toLowerCase();
  return (
    PROJECT_WORKSPACE_TABS.find((tab) => tab.key === key)?.key ??
    (Object.hasOwn(aliases, key) ? aliases[key] : "overview")
  );
}
