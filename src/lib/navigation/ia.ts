export type HhProjectOsSectionKey =
  | "DASHBOARD"
  | "PROJECTS"
  | "FINANCIAL"
  | "PEOPLE"
  | "DOCUMENTS"
  | "SETTINGS";

export type HhProjectOsIconKey =
  | "accounts"
  | "activity"
  | "ar"
  | "backups"
  | "bank"
  | "bills"
  | "cashflow"
  | "changeOrders"
  | "commission"
  | "company"
  | "customers"
  | "dashboard"
  | "deposits"
  | "documents"
  | "estimates"
  | "expenses"
  | "financial"
  | "inspection"
  | "invoice"
  | "logs"
  | "materials"
  | "metrics"
  | "payments"
  | "payroll"
  | "photos"
  | "preferences"
  | "projects"
  | "punchList"
  | "receipts"
  | "reimbursements"
  | "roles"
  | "schedule"
  | "settings"
  | "subcontractors"
  | "tasks"
  | "users"
  | "vendors"
  | "workerAdvances"
  | "workerBalances"
  | "workerInvoices"
  | "workerPayments"
  | "workerSummary"
  | "workers";

export type HhProjectOsBadge = "expenseInbox" | "systemHealth";

export type HhProjectOsNavItem = {
  type?: "item";
  href: string;
  label: string;
  icon: HhProjectOsIconKey;
  exact?: boolean;
  aliases?: readonly string[];
  badge?: HhProjectOsBadge;
};

export type HhProjectOsNavSubheader = {
  type: "subheader";
  label: string;
};

export type HhProjectOsNavEntry = HhProjectOsNavItem | HhProjectOsNavSubheader;

export type HhProjectOsNavSection = {
  key: HhProjectOsSectionKey;
  label: string;
  entries: readonly HhProjectOsNavEntry[];
};

export const HH_PROJECT_OS_SECTION_KEYS = [
  "DASHBOARD",
  "PROJECTS",
  "FINANCIAL",
  "PEOPLE",
  "DOCUMENTS",
  "SETTINGS",
] as const satisfies readonly HhProjectOsSectionKey[];

export const HH_PROJECT_OS_DEFAULT_OPEN_SECTIONS: Record<HhProjectOsSectionKey, boolean> = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

export const HH_PROJECT_OS_NAV_SECTIONS = [
  {
    key: "DASHBOARD",
    label: "DASHBOARD",
    entries: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/dashboard/cashflow", label: "Cash Flow", icon: "cashflow" },
      { href: "/financial/owner", label: "Owner Dashboard", icon: "activity" },
    ],
  },
  {
    key: "PROJECTS",
    label: "PROJECTS",
    entries: [
      { href: "/projects", label: "Projects", icon: "projects" },
      { href: "/estimates", label: "Estimates", icon: "estimates" },
      { href: "/change-orders", label: "Change Orders", icon: "changeOrders" },
      { href: "/customers", label: "Customers", icon: "customers" },
      { type: "subheader", label: "Operations" },
      { href: "/tasks", label: "Tasks", icon: "tasks" },
      { href: "/punch-list", label: "Punch List", icon: "punchList" },
      { href: "/schedule", label: "Schedule", icon: "schedule" },
      { href: "/materials/catalog", label: "Material Catalog", icon: "materials" },
    ],
  },
  {
    key: "FINANCIAL",
    label: "FINANCIAL",
    entries: [
      { href: "/financial", label: "Overview", icon: "financial", exact: true },
      { type: "subheader", label: "AR" },
      { href: "/financial/ar", label: "AR Summary", icon: "ar" },
      { href: "/financial/invoices", label: "Invoices", icon: "invoice" },
      { href: "/financial/payments", label: "Payments Received", icon: "payments" },
      { href: "/financial/deposits", label: "Deposits", icon: "deposits" },
      { type: "subheader", label: "AP" },
      { href: "/bills", label: "Bills", icon: "bills", aliases: ["/financial/bills"] },
      { href: "/financial/expenses", label: "Expenses", icon: "expenses" },
      {
        href: "/financial/inbox",
        label: "Receipt Inbox",
        icon: "receipts",
        badge: "expenseInbox",
      },
      { href: "/labor/reimbursements", label: "Worker Reimbursements", icon: "reimbursements" },
      { href: "/labor/worker-balances", label: "Worker Balances", icon: "workerBalances" },
      { href: "/labor/payments", label: "Worker Payments", icon: "workerPayments" },
      { href: "/labor/advances", label: "Worker Advances", icon: "workerAdvances" },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: "workerInvoices" },
      { href: "/labor/payroll", label: "Payroll Summary", icon: "payroll" },
      { href: "/financial/commissions", label: "Commission Payments", icon: "commission" },
      { type: "subheader", label: "Cash" },
      { href: "/financial/accounts", label: "Accounts", icon: "accounts" },
      { href: "/financial/bank", label: "Bank Transactions", icon: "bank" },
    ],
  },
  {
    key: "PEOPLE",
    label: "PEOPLE",
    entries: [
      { href: "/labor", label: "Time Entries", icon: "workers" },
      { href: "/workers", label: "Workers", icon: "workers" },
      { href: "/workers/summary", label: "Worker Summary", icon: "workerSummary" },
      { href: "/financial/vendors", label: "Vendors", icon: "vendors" },
      { href: "/subcontractors", label: "Subcontractors", icon: "subcontractors" },
    ],
  },
  {
    key: "DOCUMENTS",
    label: "DOCUMENTS",
    entries: [
      { href: "/documents", label: "Documents", icon: "documents" },
      { href: "/site-photos", label: "Site Photos", icon: "photos" },
      { href: "/inspection-log", label: "Inspection Log", icon: "inspection" },
      { href: "/labor/receipts", label: "Worker Receipts", icon: "receipts" },
      { href: "/upload-receipt", label: "Upload Receipt", icon: "receipts" },
    ],
  },
  {
    key: "SETTINGS",
    label: "SETTINGS",
    entries: [
      { href: "/settings", label: "Settings", icon: "settings", exact: true },
      { href: "/settings/company", label: "Company", icon: "company" },
      { href: "/settings/users", label: "Users", icon: "users" },
      { href: "/settings/permissions", label: "Roles", icon: "roles" },
      { href: "/settings/account", label: "Account", icon: "settings" },
      { href: "/settings/expenses", label: "Expense Preferences", icon: "preferences" },
      { href: "/settings/lists", label: "Lists", icon: "preferences" },
      { href: "/settings/categories", label: "Categories", icon: "preferences" },
      { href: "/settings/subcontractors", label: "Subcontractor Settings", icon: "subcontractors" },
      { href: "/settings/project-financial-review", label: "Financial Review", icon: "financial" },
      { type: "subheader", label: "Admin Center" },
      { href: "/system-health", label: "System Health", icon: "activity", badge: "systemHealth" },
      { href: "/system-metrics", label: "System Metrics", icon: "metrics" },
      { href: "/system-logs", label: "System Logs", icon: "logs" },
      { href: "/system/backups", label: "Backups", icon: "backups", aliases: ["/backups"] },
    ],
  },
] as const satisfies readonly HhProjectOsNavSection[];

export const HH_PROJECT_OS_MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/financial", label: "Financial", icon: "financial", exact: true },
  { href: "/workers", label: "People", icon: "workers" },
  { href: "/documents", label: "Documents", icon: "documents" },
] as const satisfies readonly HhProjectOsNavItem[];

export const HH_PROJECT_OS_COMMAND_ITEMS = [
  {
    id: "go-dashboard",
    label: "Go to Dashboard",
    description: "Open the executive command center",
    href: "/dashboard",
    keywords: ["home", "overview", "command center", "kpi"],
    icon: "dashboard",
  },
  {
    id: "go-projects",
    label: "Go to Projects",
    description: "Project pipeline, estimates, change orders, and operations",
    href: "/projects",
    keywords: ["jobs", "work", "construction", "operations"],
    icon: "projects",
  },
  {
    id: "go-financial",
    label: "Go to Financial",
    description: "Financial overview, AR, AP, cash, and reports",
    href: "/financial",
    keywords: ["finance", "financial", "ar", "ap", "cash", "reports"],
    icon: "financial",
  },
  {
    id: "go-people",
    label: "Go to People",
    description: "Workers, vendors, and subcontractors",
    href: "/workers",
    keywords: ["people", "workers", "vendors", "subcontractors", "contacts"],
    icon: "workers",
  },
  {
    id: "go-documents",
    label: "Go to Documents",
    description: "Documents, site photos, receipts, and inspections",
    href: "/documents",
    keywords: ["files", "plans", "photos", "receipts", "inspections"],
    icon: "documents",
  },
  {
    id: "go-invoices",
    label: "Go to Invoices",
    description: "AR, invoice list, drafts, and balances",
    href: "/financial/invoices",
    keywords: ["billing", "ar", "receivable", "finance"],
    icon: "invoice",
  },
  {
    id: "go-expenses",
    label: "Go to Expenses",
    description: "Expenses, inbox, and receipt workflow",
    href: "/financial/expenses",
    keywords: ["receipts", "costs", "ap", "inbox"],
    icon: "expenses",
  },
  {
    id: "go-settings",
    label: "Go to Settings",
    description: "Company, users, roles, preferences, and Admin Center",
    href: "/settings/company",
    keywords: ["admin", "company", "security", "users", "roles"],
    icon: "settings",
  },
] as const;

export function isHhProjectOsNavItem(entry: HhProjectOsNavEntry): entry is HhProjectOsNavItem {
  return entry.type !== "subheader";
}
