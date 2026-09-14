import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";

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

export type HhProjectOsNavItem = {
  href: string;
  label: string;
  icon: HhProjectOsIconKey;
  exact?: boolean;
  aliases?: readonly string[];
  badge?: "systemHealth";
  group?: string;
};

export type HhProjectOsNavSection = HhProjectOsNavItem & {
  key: string;
  entries: readonly HhProjectOsNavItem[];
};

export const HH_PROJECT_OS_NAV_SECTIONS: readonly HhProjectOsNavSection[] = [
  {
    key: "DASHBOARD",
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    exact: true,
    entries: [],
  },
  {
    key: "PROJECTS",
    label: "Projects",
    href: "/projects",
    icon: "projects",
    aliases: [
      "/change-orders",
      "/tasks",
      "/punch-list",
      "/schedule",
      "/materials",
      "/documents",
      "/site-photos",
      "/inspection-log",
    ],
    entries: [
      { href: "/projects", label: "Overview", icon: "projects", exact: true },
      { href: "/schedule", label: "Schedule", icon: "schedule" },
      { href: "/tasks", label: "Tasks", icon: "tasks" },
      { href: "/punch-list", label: "Punch List", icon: "punchList" },
      { href: "/site-photos", label: "Photos", icon: "photos" },
      { href: "/inspection-log", label: "Inspections", icon: "inspection" },
      { href: "/materials", label: "Material Selections", icon: "materials" },
      { href: "/change-orders", label: "Change Orders", icon: "changeOrders" },
      { href: "/documents", label: "Documents", icon: "documents" },
    ],
  },
  {
    key: "ESTIMATES",
    label: "Estimates",
    href: "/estimates",
    icon: "estimates",
    aliases: ["/estimate-templates"],
    entries: [
      { href: "/estimates", label: "Estimates", icon: "estimates" },
      { href: "/estimate-templates", label: "Templates", icon: "estimates" },
    ],
  },
  {
    key: "FINANCIAL",
    label: "Finance",
    href: "/financial",
    icon: "financial",
    aliases: ["/finance", "/bills", "/dashboard/cashflow"],
    entries: [
      {
        href: "/financial",
        label: "Overview",
        icon: "financial",
        exact: true,
        aliases: ["/finance", "/financial/dashboard", "/financial/owner"],
      },
      {
        href: "/financial/ar",
        label: "Billing",
        icon: "ar",
        aliases: [
          "/financial/invoices",
          "/financial/payments",
          "/financial/payments-received",
          "/financial/estimates",
        ],
      },
      {
        href: "/financial/payables",
        label: "Payables",
        icon: "bills",
        aliases: ["/bills", "/financial/bills", "/financial/commissions"],
      },
      {
        href: "/financial/inbox",
        label: "Expenses",
        icon: "expenses",
        aliases: ["/financial/expenses", "/financial/expenses/overview", "/labor/reimbursements"],
      },
      {
        href: "/financial/accounts/overview",
        label: "Accounts",
        icon: "accounts",
        aliases: [
          "/financial/accounts",
          "/financial/deposits",
          "/financial/bank",
          "/dashboard/cashflow",
        ],
      },
    ],
  },
  {
    key: "LABOR",
    label: "Labor",
    href: "/labor",
    icon: "workers",
    aliases: ["/workers", "/reports/workforce", "/financial/reimbursements", "/finance/labor-cost"],
    entries: [
      {
        href: "/labor",
        label: "Time Entries",
        icon: "workers",
        exact: true,
        aliases: [
          "/labor/entries",
          "/labor/daily",
          "/labor/daily-entry",
          "/labor/review",
          "/labor/timesheets",
          "/labor/monthly",
        ],
      },
      { href: "/finance/labor-cost", label: "Labor Cost", icon: "workers", group: "Costs" },
      { href: "/labor/cost-allocation", label: "Cost Allocation", icon: "workers", group: "Costs" },
      { href: "/workers", label: "Workers", icon: "workers", aliases: ["/labor/workers"] },
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
      {
        href: "/labor/reimbursements",
        label: "Reimbursements",
        icon: "reimbursements",
        aliases: ["/financial/reimbursements"],
      },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: "workerInvoices" },
    ],
  },
  {
    key: "CONTACTS",
    label: "Contacts",
    href: "/customers",
    icon: "customers",
    aliases: [
      "/subcontractors",
      "/labor/subcontractors",
      "/financial/vendors",
      "/vendors",
      "/people/vendors",
    ],
    entries: [
      { href: "/customers", label: "Customers", icon: "customers" },
      {
        href: "/subcontractors",
        label: "Subcontractors",
        icon: "subcontractors",
        aliases: ["/labor/subcontractors"],
      },
      {
        href: "/financial/vendors",
        label: "Vendors",
        icon: "vendors",
        aliases: ["/vendors", "/people/vendors"],
      },
    ],
  },
  {
    key: "INBOX",
    label: "Inbox",
    href: UPLOAD_RECEIPT_ACTION.href,
    icon: "receipts",
    aliases: ["/financial/receipt-queue", "/labor/receipts"],
    entries: [],
  },
  {
    key: "REPORTS",
    label: "Reports",
    href: "/reports",
    icon: "metrics",
    aliases: ["/settings/project-financial-review"],
    entries: [
      { href: "/reports", label: "Overview", icon: "metrics" },
      {
        href: "/settings/project-financial-review",
        label: "Project Financial Review",
        icon: "financial",
      },
    ],
  },
  {
    key: "SETTINGS",
    label: "Settings",
    href: "/settings/company",
    icon: "settings",
    badge: "systemHealth",
    aliases: [
      "/settings",
      "/system-health",
      "/system-metrics",
      "/system-logs",
      "/system/backups",
      "/backups",
    ],
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
      {
        href: "/system-health",
        label: "System Health",
        icon: "activity",
        group: "Admin Center",
        badge: "systemHealth",
        aliases: ["/settings/system-health"],
      },
      { href: "/system-metrics", label: "System Metrics", icon: "metrics", group: "Admin Center" },
      { href: "/system-logs", label: "System Logs", icon: "logs", group: "Admin Center" },
      {
        href: "/system/backups",
        label: "Backups",
        icon: "backups",
        group: "Admin Center",
        aliases: ["/backups"],
      },
    ],
  },
];

// The complete workspace menu remains available in the mobile drawer.
export const HH_PROJECT_OS_MOBILE_NAV_ITEMS = HH_PROJECT_OS_NAV_SECTIONS.filter((item) =>
  ["DASHBOARD", "PROJECTS", "FINANCIAL", "LABOR", "INBOX"].includes(item.key)
);

function normalizeHhProjectOsPath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
}

function matchedPathLength(pathname: string, item: HhProjectOsNavItem): number {
  const path = normalizeHhProjectOsPath(pathname);
  return Math.max(
    0,
    ...[item.href, ...(item.aliases ?? [])].map((href) => {
      const target = normalizeHhProjectOsPath(href);
      return path === target || (!item.exact && path.startsWith(`${target}/`)) ? target.length : 0;
    })
  );
}

export function getHhProjectOsWorkspace(
  pathname: string | null | undefined
): HhProjectOsNavSection | null {
  const path = normalizeHhProjectOsPath(pathname);
  // Finance receipt review shares the Finance shell; standalone intake keeps its own workspace.
  if (path === "/financial/inbox" || path.startsWith("/financial/inbox/")) {
    return HH_PROJECT_OS_NAV_SECTIONS.find((item) => item.key === "FINANCIAL") ?? null;
  }
  return HH_PROJECT_OS_NAV_SECTIONS.reduce<HhProjectOsNavSection | null>(
    (active, item) =>
      matchedPathLength(path, item) > (active ? matchedPathLength(path, active) : 0)
        ? item
        : active,
    null
  );
}

export function getHhProjectOsMobileActiveHref(pathname: string | null | undefined): string | null {
  return getHhProjectOsWorkspace(pathname)?.href ?? null;
}

export function getHhProjectOsWorkspaceActiveHref(
  pathname: string,
  workspace: HhProjectOsNavSection
): string | null {
  return (
    workspace.entries.reduce<HhProjectOsNavItem | null>(
      (active, item) =>
        matchedPathLength(pathname, item) > (active ? matchedPathLength(pathname, active) : 0)
          ? item
          : active,
      null
    )?.href ?? null
  );
}

export const HH_PROJECT_OS_COMMAND_ITEMS = [
  {
    id: "go-estimates",
    label: "Go to Estimates",
    description: "Open estimates and templates",
    href: "/estimates",
    keywords: ["estimates", "quotes", "proposals"],
    icon: "estimates",
  },
  {
    id: "go-labor",
    label: "Go to Labor",
    description: "Open time entries, workers, and workforce payments",
    href: "/labor",
    keywords: ["labor", "workers", "workforce", "payroll"],
    icon: "workers",
  },
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
    description: "Projects, change orders, documents, and field operations",
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
    label: "Go to Finance",
    description: "Financial overview, billing, payables, expenses, and accounts",
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
    label: "Go to Workforce",
    description: "Open workforce payroll, balances, payments, advances, and statements",
    href: "/reports/workforce",
    keywords: ["reports", "workforce", "payroll", "workers", "balances", "payments"],
    icon: "payroll",
  },
  {
    id: "go-people",
    label: "Go to Contacts",
    description: "Customers, vendors, and subcontractors",
    href: "/customers",
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
