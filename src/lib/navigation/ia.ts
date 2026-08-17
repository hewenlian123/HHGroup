import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";

export type HhProjectOsSectionKey =
  | "DASHBOARD"
  | "PROJECTS"
  | "FINANCIAL"
  | "PEOPLE"
  | "REPORTS"
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

export type HhProjectOsBadge = "systemHealth";

export type HhProjectOsNavItem = {
  type?: "item";
  href: string;
  label: string;
  icon: HhProjectOsIconKey;
  exact?: boolean;
  aliases?: readonly string[];
  excludePaths?: readonly string[];
  badge?: HhProjectOsBadge;
};

export type HhProjectOsNavSubheader = {
  type: "subheader";
  label: string;
};

export type HhProjectOsNavPlaceholder = {
  type: "placeholder";
  label: string;
  icon: HhProjectOsIconKey;
  note?: string;
};

export type HhProjectOsNavEntry =
  | HhProjectOsNavItem
  | HhProjectOsNavSubheader
  | HhProjectOsNavPlaceholder;

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
  "REPORTS",
  "DOCUMENTS",
  "SETTINGS",
] as const satisfies readonly HhProjectOsSectionKey[];

export const HH_PROJECT_OS_DEFAULT_OPEN_SECTIONS: Record<HhProjectOsSectionKey, boolean> = {
  DASHBOARD: true,
  PROJECTS: true,
  FINANCIAL: true,
  PEOPLE: true,
  REPORTS: true,
  DOCUMENTS: true,
  SETTINGS: true,
};

export const HH_PROJECT_OS_NAV_SECTIONS = [
  {
    key: "DASHBOARD",
    label: "DASHBOARD",
    entries: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true }],
  },
  {
    key: "PROJECTS",
    label: "PROJECTS",
    entries: [
      { href: "/projects", label: "Projects", icon: "projects" },
      { href: "/estimates", label: "Estimates", icon: "estimates" },
      { href: "/change-orders", label: "Change Orders", icon: "changeOrders" },
      { href: "/labor", label: "Time Entries", icon: "workers", exact: true },
      { href: "/tasks", label: "Tasks", icon: "tasks" },
      { href: "/punch-list", label: "Punch List", icon: "punchList" },
      { href: "/schedule", label: "Schedule", icon: "schedule" },
      {
        href: "/materials",
        label: "Material Selections",
        icon: "materials",
        aliases: ["/materials/catalog"],
      },
    ],
  },
  {
    key: "FINANCIAL",
    label: "FINANCIAL",
    entries: [
      {
        href: "/financial",
        label: "Overview",
        icon: "financial",
        exact: true,
        aliases: ["/financial/dashboard", "/finance"],
      },
      { href: "/financial/owner", label: "Owner Dashboard", icon: "activity" },
      {
        href: "/financial/ar",
        label: "AR",
        icon: "ar",
        aliases: ["/financial/estimates"],
      },
      { href: "/financial/invoices", label: "Invoices", icon: "invoice" },
      { href: "/estimate-templates", label: "Estimate Templates", icon: "estimates" },
      {
        href: "/financial/payments",
        label: "Payments Received",
        icon: "payments",
        aliases: ["/financial/payments-received"],
      },
      { href: "/financial/deposits", label: "Deposits", icon: "deposits" },
      { type: "subheader", label: "AP" },
      { href: "/bills", label: "Bills", icon: "bills", aliases: ["/financial/bills"] },
      {
        href: "/financial/expenses",
        label: "Expense Operations",
        icon: "expenses",
        aliases: [
          UPLOAD_RECEIPT_ACTION.href,
          "/financial/receipt-queue",
          "/labor/reimbursements",
          "/financial/reimbursements",
          "/labor/receipts",
        ],
      },
      { href: "/financial/commissions", label: "Commission Payments", icon: "commission" },
      { type: "subheader", label: "Cash" },
      { href: "/financial/accounts", label: "Accounts", icon: "accounts" },
      { href: "/financial/bank", label: "Bank Transactions", icon: "bank" },
      { href: "/dashboard/cashflow", label: "Cash Flow", icon: "cashflow" },
    ],
  },
  {
    key: "PEOPLE",
    label: "DIRECTORY",
    entries: [
      { href: "/customers", label: "Customers", icon: "customers" },
      {
        href: "/workers",
        label: "Workers",
        icon: "workers",
        aliases: ["/labor/workers"],
      },
      {
        href: "/financial/vendors",
        label: "Vendors",
        icon: "vendors",
        aliases: ["/vendors", "/people/vendors"],
      },
      {
        href: "/subcontractors",
        label: "Subcontractors",
        icon: "subcontractors",
        aliases: ["/labor/subcontractors"],
      },
    ],
  },
  {
    key: "REPORTS",
    label: "REPORTS",
    entries: [
      {
        href: "/reports",
        label: "Reports",
        icon: "metrics",
        exact: true,
        aliases: ["/settings/project-financial-review"],
      },
      {
        href: "/reports/workforce",
        label: "Workforce",
        icon: "payroll",
        aliases: [
          "/workers/summary",
          "/labor/payroll",
          "/labor/payroll-summary",
          "/labor/worker-balances",
          "/labor/payments",
          "/labor/advances",
        ],
      },
    ],
  },
  {
    key: "DOCUMENTS",
    label: "DOCUMENTS",
    entries: [
      { href: "/documents", label: "Documents", icon: "documents" },
      { href: "/site-photos", label: "Site Photos", icon: "photos" },
      { href: "/inspection-log", label: "Inspection Log", icon: "inspection" },
    ],
  },
  {
    key: "SETTINGS",
    label: "SETTINGS",
    entries: [
      {
        href: "/settings/company",
        label: "Company",
        icon: "company",
        exact: true,
        aliases: ["/settings"],
      },
      { href: "/settings/users", label: "Users", icon: "users" },
      { href: "/settings/permissions", label: "Roles", icon: "roles" },
      {
        href: "/settings/expenses",
        label: "Preferences",
        icon: "preferences",
        aliases: [
          "/settings/account",
          "/settings/security",
          "/settings/lists",
          "/settings/categories",
          "/settings/subcontractors",
        ],
      },
      { type: "subheader", label: "Admin Center" },
      {
        href: "/system-health",
        label: "System Health",
        icon: "activity",
        badge: "systemHealth",
        aliases: ["/settings/system-health"],
      },
      { href: "/system-metrics", label: "System Metrics", icon: "metrics" },
      { href: "/system-logs", label: "System Logs", icon: "logs" },
      { href: "/system/backups", label: "Backups", icon: "backups", aliases: ["/backups"] },
    ],
  },
] as const satisfies readonly HhProjectOsNavSection[];

export const HH_PROJECT_OS_MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/projects", label: "Projects", icon: "projects" },
  {
    href: "/financial",
    label: "Financial",
    icon: "financial",
    exact: true,
    aliases: [
      "/finance",
      "/bills",
      "/financial/ar",
      "/financial/bills",
      "/financial/invoices",
      "/estimate-templates",
      "/financial/payments",
      "/financial/payments-received",
      "/financial/deposits",
      "/financial/expenses",
      UPLOAD_RECEIPT_ACTION.href,
      "/financial/receipt-queue",
      "/financial/accounts",
      "/financial/bank",
      "/financial/commissions",
      "/financial/reimbursements",
      "/dashboard/cashflow",
      "/labor/reimbursements",
      "/labor/receipts",
    ],
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "metrics",
    aliases: ["/settings/project-financial-review"],
  },
  {
    href: "/workers",
    label: "Directory",
    icon: "workers",
    aliases: [
      "/customers",
      "/financial/vendors",
      "/vendors",
      "/people/vendors",
      "/subcontractors",
      "/labor/subcontractors",
      "/labor/workers",
    ],
  },
  {
    href: "/documents",
    label: "Documents",
    icon: "documents",
    aliases: ["/projects/documents", "/site-photos", "/inspection-log"],
  },
] as const satisfies readonly HhProjectOsNavItem[];

type HhProjectOsMobileNavHref = (typeof HH_PROJECT_OS_MOBILE_NAV_ITEMS)[number]["href"];

type HhProjectOsMobileRouteOwner = {
  href: HhProjectOsMobileNavHref;
  paths: readonly ({ href: string; exact?: boolean } | string)[];
};

const HH_PROJECT_OS_MOBILE_ROUTE_OWNERS = [
  {
    href: "/workers",
    paths: [
      "/customers",
      "/workers",
      "/financial/vendors",
      "/vendors",
      "/people/vendors",
      "/subcontractors",
      "/labor/subcontractors",
      "/labor/workers",
    ],
  },
  {
    href: "/documents",
    paths: ["/documents", "/projects/documents", "/site-photos", "/inspection-log"],
  },
  {
    href: "/financial",
    paths: [
      "/financial",
      "/finance",
      "/bills",
      "/financial/ar",
      "/financial/bills",
      "/financial/invoices",
      "/estimate-templates",
      "/financial/payments",
      "/financial/payments-received",
      "/financial/deposits",
      "/financial/expenses",
      UPLOAD_RECEIPT_ACTION.href,
      "/financial/receipt-queue",
      "/financial/accounts",
      "/financial/bank",
      "/financial/commissions",
      "/financial/reimbursements",
      "/dashboard/cashflow",
      "/labor/reimbursements",
      "/labor/receipts",
    ],
  },
  {
    href: "/reports",
    paths: [
      "/reports",
      "/settings/project-financial-review",
      "/workers/summary",
      "/labor/payroll",
      "/labor/payroll-summary",
      "/labor/payments",
      "/labor/advances",
      "/labor/worker-balances",
      "/labor/worker-invoices",
    ],
  },
  {
    href: "/projects",
    paths: [
      "/projects",
      "/estimates",
      "/change-orders",
      "/tasks",
      "/punch-list",
      "/schedule",
      "/materials",
      { href: "/labor", exact: true },
      "/labor/entries",
      "/labor/daily",
      "/labor/daily-entry",
      "/labor/review",
      "/labor/timesheets",
      "/labor/monthly",
      "/labor/cost-allocation",
    ],
  },
  { href: "/dashboard", paths: [{ href: "/dashboard", exact: true }] },
] as const satisfies readonly HhProjectOsMobileRouteOwner[];

function normalizeHhProjectOsPath(pathname: string | null | undefined): string {
  const path = (pathname ?? "").split("?")[0].split("#")[0].replace(/\/+$/, "");
  return path || "/";
}

function hhProjectOsPathMatches(pathname: string, target: string, exact?: boolean): boolean {
  const path = normalizeHhProjectOsPath(pathname);
  const cleanedTarget = normalizeHhProjectOsPath(target);
  if (exact) return path === cleanedTarget;
  return path === cleanedTarget || path.startsWith(`${cleanedTarget}/`);
}

export function getHhProjectOsMobileActiveHref(
  pathname: string | null | undefined
): HhProjectOsMobileNavHref | null {
  const path = normalizeHhProjectOsPath(pathname);

  for (const owner of HH_PROJECT_OS_MOBILE_ROUTE_OWNERS) {
    for (const entry of owner.paths) {
      const href = typeof entry === "string" ? entry : entry.href;
      const exact = typeof entry === "string" ? false : entry.exact;
      if (hhProjectOsPathMatches(path, href, exact)) return owner.href;
    }
  }

  return null;
}

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
    id: "go-change-orders",
    label: "Go to Change Orders",
    description: "Open project change orders",
    href: "/change-orders",
    keywords: ["projects", "change orders", "scope", "co"],
    icon: "changeOrders",
  },
  {
    id: "go-tasks",
    label: "Go to Tasks",
    description: "Open project tasks and operations",
    href: "/tasks",
    keywords: ["projects", "tasks", "operations", "work"],
    icon: "tasks",
  },
  {
    id: "go-punch-list",
    label: "Go to Punch List",
    description: "Open punch items and closeout work",
    href: "/punch-list",
    keywords: ["projects", "punch", "punch list", "closeout", "tasks"],
    icon: "punchList",
  },
  {
    id: "go-schedule",
    label: "Go to Schedule",
    description: "Open project schedule",
    href: "/schedule",
    keywords: ["projects", "schedule", "calendar", "operations"],
    icon: "schedule",
  },
  {
    id: "go-material-selections",
    label: "Go to Material Selections",
    description: "Open customer/project material approval sheets",
    href: "/materials",
    keywords: ["projects", "materials", "selections", "approval", "finishes"],
    icon: "materials",
  },
  {
    id: "go-financial",
    label: "Go to Financial",
    description: "Financial overview, AR, AP, and cash",
    href: "/financial",
    keywords: ["finance", "financial", "ar", "ap", "cash"],
    icon: "financial",
  },
  {
    id: "go-financial-owner",
    label: "Go to Owner Dashboard",
    description: "Open executive financial dashboard",
    href: "/financial/owner",
    keywords: ["finance", "financial", "owner", "dashboard", "kpi"],
    icon: "activity",
  },
  {
    id: "go-ar-summary",
    label: "Go to AR Summary",
    description: "Open receivables aging and collection status",
    href: "/financial/ar",
    keywords: ["receivables", "ar", "aging", "collections"],
    icon: "ar",
  },
  {
    id: "go-financial-ap",
    label: "Go to AP",
    description: "Open bills and payables",
    href: "/bills",
    keywords: ["finance", "financial", "ap", "accounts payable", "payables", "bills"],
    icon: "bills",
  },
  {
    id: "go-financial-cash",
    label: "Go to Cash",
    description: "Open accounts and cash activity",
    href: "/financial/accounts",
    keywords: ["finance", "financial", "cash", "accounts", "bank", "reconcile"],
    icon: "accounts",
  },
  {
    id: "go-financial-reports",
    label: "Go to Reports",
    description: "Open operating reports, profitability, AR aging, and AP aging",
    href: "/reports",
    keywords: ["finance", "financial", "reports", "profit", "aging", "ar", "ap"],
    icon: "metrics",
  },
  {
    id: "go-workforce-reports",
    label: "Go to Workforce Reports",
    description: "Open workforce payroll, balances, payments, advances, and statements",
    href: "/reports/workforce",
    keywords: ["reports", "workforce", "payroll", "workers", "balances", "payments"],
    icon: "payroll",
  },
  {
    id: "go-people",
    label: "Go to Directory",
    description: "Customers, workers, vendors, and subcontractors",
    href: "/workers",
    keywords: ["directory", "people", "customers", "workers", "vendors", "subcontractors"],
    icon: "workers",
  },
  {
    id: "go-customers",
    label: "Go to Customers",
    description: "Open customer profiles and project relationships",
    href: "/customers",
    keywords: ["directory", "people", "customers", "clients", "contacts"],
    icon: "customers",
  },
  {
    id: "go-workers",
    label: "Go to Workers",
    description: "Open worker profiles, balances, labor, receipts, advances, and payments",
    href: "/workers",
    keywords: ["directory", "people", "workers", "worker center", "labor", "crew", "pay worker"],
    icon: "workers",
  },
  {
    id: "go-worker-summary",
    label: "Go to Workforce Overview",
    description: "Open workforce overview reports",
    href: "/reports/workforce?tab=overview",
    keywords: ["reports", "workforce", "workers", "worker summary", "labor summary", "crew"],
    icon: "workerSummary",
  },
  {
    id: "go-vendors",
    label: "Go to Vendors",
    description: "Open vendor profiles and AP payees",
    href: "/financial/vendors",
    keywords: ["directory", "people", "vendors", "payees", "ap"],
    icon: "vendors",
  },
  {
    id: "go-subcontractors",
    label: "Go to Subcontractors",
    description: "Open subcontractor profiles, contracts, and AP context",
    href: "/subcontractors",
    keywords: ["directory", "people", "subcontractors", "subs", "contracts", "ap"],
    icon: "subcontractors",
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
    id: "go-site-photos",
    label: "Go to Site Photos",
    description: "Open project site photos",
    href: "/site-photos",
    keywords: ["documents", "photos", "site photos", "field", "project photos"],
    icon: "photos",
  },
  {
    id: "go-inspection-log",
    label: "Go to Inspection Log",
    description: "Open inspection records",
    href: "/inspection-log",
    keywords: ["documents", "inspection", "inspections", "log"],
    icon: "inspection",
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
    id: "go-payments-received",
    label: "Go to Payments Received",
    description: "Open customer payment history and receipts",
    href: "/financial/payments",
    keywords: ["payments received", "collections", "cash in"],
    icon: "payments",
  },
  {
    id: "go-deposits",
    label: "Go to Deposits",
    description: "Open deposit review",
    href: "/financial/deposits",
    keywords: ["deposits", "collections", "cash", "ar"],
    icon: "deposits",
  },
  {
    id: "go-bills",
    label: "Go to Bills",
    description: "Open AP bills and payables",
    href: "/bills",
    keywords: ["bills", "ap", "payables", "vendor"],
    icon: "bills",
  },
  {
    id: "go-expenses",
    label: "Go to Expense Operations",
    description: "Open Expenses, Receipt Inbox, and Reimbursements",
    href: "/financial/expenses",
    keywords: ["expense operations", "expenses", "receipts", "costs", "ap", "inbox"],
    icon: "expenses",
  },
  {
    id: "go-receipt-inbox",
    label: "Go to Receipt Inbox",
    description: "Open AP receipt intake",
    href: UPLOAD_RECEIPT_ACTION.href,
    keywords: ["receipts", "receipt inbox", "expense inbox", "inbox", "ap"],
    icon: "receipts",
  },
  {
    id: "go-bank-transactions",
    label: "Go to Bank Transactions",
    description: "Open cash reconciliation and bank activity",
    href: "/financial/bank",
    keywords: ["bank", "cash", "reconcile", "transactions"],
    icon: "bank",
  },
  {
    id: "go-cash-flow",
    label: "Go to Cash Flow",
    description: "Open cashflow dashboard",
    href: "/dashboard/cashflow",
    keywords: ["cash flow", "cashflow", "cash", "dashboard", "financial"],
    icon: "cashflow",
  },
  {
    id: "go-accounts",
    label: "Go to Accounts",
    description: "Open cash accounts",
    href: "/financial/accounts",
    keywords: ["accounts", "cash", "bank", "financial"],
    icon: "accounts",
  },
  {
    id: "go-payroll-summary",
    label: "Go to Workforce Payroll",
    description: "Open worker payroll and payable balances",
    href: "/reports/workforce?tab=payroll",
    keywords: ["reports", "workforce", "payroll", "labor", "worker pay", "ap"],
    icon: "payroll",
  },
  {
    id: "go-worker-payments",
    label: "Go to Workforce Payments",
    description: "Open worker payment history",
    href: "/reports/workforce?tab=payments",
    keywords: ["reports", "workforce", "worker payments", "payroll", "labor", "ap"],
    icon: "workerPayments",
  },
  {
    id: "go-worker-advances",
    label: "Go to Workforce Advances",
    description: "Open worker advances",
    href: "/reports/workforce?tab=advances",
    keywords: ["reports", "workforce", "worker advances", "advances", "payroll", "labor", "ap"],
    icon: "workerAdvances",
  },
  {
    id: "go-worker-reimbursements",
    label: "Go to Workforce Reimbursements",
    description: "Open worker reimbursements",
    href: "/reports/workforce?tab=reimbursements",
    keywords: [
      "reports",
      "workforce",
      "worker reimbursements",
      "reimbursements",
      "receipts",
      "payroll",
      "ap",
    ],
    icon: "reimbursements",
  },
  {
    id: "go-worker-balances",
    label: "Go to Workforce Balances",
    description: "Open worker payable balances",
    href: "/reports/workforce?tab=balances",
    keywords: ["reports", "workforce", "worker balances", "balances", "owed", "payroll", "ap"],
    icon: "workerBalances",
  },
  {
    id: "go-worker-receipts",
    label: "Go to Worker Submitted Receipts",
    description: "Open worker-submitted receipts in Receipt Inbox",
    href: "/financial/inbox/worker",
    keywords: ["worker receipts", "worker submitted", "receipt inbox", "receipts", "ap"],
    icon: "receipts",
  },
  {
    id: "go-worker-invoices",
    label: "Go to Worker Invoices",
    description: "Open worker invoices",
    href: "/labor/worker-invoices",
    keywords: ["worker invoices", "invoices", "payroll", "ap"],
    icon: "workerInvoices",
  },
  {
    id: "go-project-financial-review",
    label: "Go to Project Financial Review",
    description: "Open financial data quality and contract review",
    href: "/settings/project-financial-review",
    keywords: ["reports", "profit", "contract review", "financial review"],
    icon: "financial",
  },
  {
    id: "go-system-health",
    label: "Go to System Health",
    description: "Open Admin Center system health",
    href: "/system-health",
    keywords: ["settings", "admin", "admin center", "health", "system health"],
    icon: "activity",
  },
  {
    id: "go-system-metrics",
    label: "Go to System Metrics",
    description: "Open Admin Center metrics",
    href: "/system-metrics",
    keywords: ["settings", "admin", "admin center", "metrics", "system metrics"],
    icon: "metrics",
  },
  {
    id: "go-system-logs",
    label: "Go to System Logs",
    description: "Open Admin Center logs",
    href: "/system-logs",
    keywords: ["settings", "admin", "admin center", "logs", "system logs"],
    icon: "logs",
  },
  {
    id: "go-backups",
    label: "Go to Backups",
    description: "Open Admin Center backups",
    href: "/system/backups",
    keywords: ["settings", "admin", "admin center", "backups", "system backups"],
    icon: "backups",
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
  return entry.type == null || entry.type === "item";
}

export function isHhProjectOsNavPlaceholder(
  entry: HhProjectOsNavEntry
): entry is HhProjectOsNavPlaceholder {
  return entry.type === "placeholder";
}
