"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, PanelLeft, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase";
import { companyProfileQueryKey, fetchCompanyProfileForNav } from "@/lib/queries/companyProfile";
import { getCompanyInitials } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useBreadcrumbOverrides } from "@/contexts/breadcrumb-override-context";
import { NeoKeyboardHint } from "@/components/command/neo-command-palette";
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";
import { cn } from "@/lib/utils";

/** Map path segments to breadcrumb display labels (for last segment, or section names). */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  project: "Project",
  estimates: "Estimates",
  estimate: "Estimate",
  tasks: "Tasks",
  "punch-list": "Punch List",
  schedule: "Schedule",
  "site-photos": "Site Photos",
  "inspection-log": "Inspection Log",
  materials: "Material Selections",
  catalog: "Material Selections",
  financial: "Financial",
  finance: "Financial",
  people: "Directory",
  invoices: "Invoices",
  invoice: "Invoice",
  payments: "Payments",
  deposits: "Deposits",
  bills: "Bills",
  bill: "Bill",
  expenses: "Expenses",
  expense: "Expense",
  accounts: "Accounts",
  labor: "Labor",
  workers: "Workers",
  summary: "Worker Summary",
  worker: "Worker",
  daily: "Daily Entry",
  receipts: "Worker Receipts",
  reimbursements: "Worker Reimbursements",
  "worker-invoices": "Worker Invoices",
  "payroll-summary": "Payroll Summary",
  payroll: "Payroll",
  "upload-receipt": "Upload Worker Receipt",
  customers: "Customers",
  documents: "Documents",
  settings: "Settings",
  ar: "AR",
  vendors: "Vendors",
  bank: "Bank",
  commissions: "Commissions",
  procurement: "Procurement",
  subcontractors: "Subcontractors",
  "change-orders": "Change Orders",
  "daily-logs": "Daily Logs",
  review: "Review",
  timesheets: "Timesheets",
  entries: "Entries",
  monthly: "Monthly",
  statement: "Statement",
  "cost-allocation": "Cost Allocation",
  new: "New",
  edit: "Edit",
  print: "Print",
  snapshot: "Snapshot",
  preview: "Preview",
  closeout: "Closeout",
  profit: "Profit",
  lists: "Lists",
  company: "Company",
  account: "Account",
  users: "Users",
  permissions: "Roles",
  categories: "Categories",
  subcontracts: "Subcontracts",
  "system-health": "System Health",
  "system-tests": "System Tests",
  "system-metrics": "System Metrics",
  "system-logs": "System Logs",
  "worker-balances": "Worker Balances",
};

const LOGICAL_BREADCRUMB_RULES = [
  {
    prefix: "/reports",
    labels: ["Reports"],
  },
  {
    prefix: "/settings/project-financial-review",
    labels: ["Reports", "Project Financial Review"],
  },
  { prefix: "/financial/vendors", labels: ["Directory", "Vendors"] },
  { prefix: UPLOAD_RECEIPT_ACTION.href, labels: ["Financial", "AP", "Receipt Inbox"] },
  { prefix: "/financial/receipt-queue", labels: ["Financial", "AP", "Receipt Queue"] },
  { prefix: "/financial/expenses", labels: ["Financial", "AP", "Expenses"] },
  { prefix: "/financial/commissions", labels: ["Financial", "AP", "Commissions"] },
  { prefix: "/financial/bills", labels: ["Financial", "AP", "Bills"] },
  { prefix: "/financial/accounts", labels: ["Financial", "Cash", "Accounts"] },
  { prefix: "/financial/bank", labels: ["Financial", "Cash", "Bank Transactions"] },
  { prefix: "/dashboard/cashflow", labels: ["Financial", "Cash", "Cash Flow"] },
  { prefix: "/financial/ar", labels: ["Financial", "AR"] },
  { prefix: "/financial/invoices", labels: ["Financial", "AR", "Invoices"] },
  { prefix: "/financial/payments", labels: ["Financial", "AR", "Payments Received"] },
  { prefix: "/financial/payments-received", labels: ["Financial", "AR", "Payments Received"] },
  { prefix: "/financial/deposits", labels: ["Financial", "AR", "Deposits"] },
  { prefix: "/bills", labels: ["Financial", "AP", "Bills"] },
  { prefix: "/labor/payroll-summary", labels: ["Reports", "Workforce", "Payroll"] },
  { prefix: "/labor/payroll", labels: ["Reports", "Workforce", "Payroll"] },
  { prefix: "/labor/payments", labels: ["Reports", "Workforce", "Payments"] },
  { prefix: "/labor/advances", labels: ["Reports", "Workforce", "Advances"] },
  { prefix: "/labor/reimbursements", labels: ["Financial", "AP", "Reimbursements"] },
  { prefix: "/labor/worker-balances", labels: ["Reports", "Workforce", "Balances"] },
  { prefix: "/labor/worker-invoices", labels: ["Reports", "Workforce", "Statements"] },
  { prefix: "/labor/receipts", labels: ["Financial", "AP", "Worker Receipts"] },
  { prefix: "/materials", labels: ["Projects", "Material Selections"] },
  { prefix: "/system/backups", labels: ["Settings", "Admin Center", "Backups"] },
  { prefix: "/settings/system-health", labels: ["Settings", "Admin Center", "System Health"] },
  { prefix: "/system-health", labels: ["Settings", "Admin Center", "System Health"] },
  { prefix: "/system-metrics", labels: ["Settings", "Admin Center", "Metrics"] },
  { prefix: "/system-logs", labels: ["Settings", "Admin Center", "Logs"] },
  { prefix: "/backups", labels: ["Settings", "Admin Center", "Backups"] },
] as const satisfies readonly { prefix: string; labels: readonly string[] }[];

/** When under /labor, "payments" shows as "Worker Payments". */
function getBreadcrumbLabel(segment: string, pathSegments: string[]): string {
  const lower = segment.toLowerCase();
  if (pathSegments[0] === "labor" && lower === "payments") return "Worker Payments";
  return (
    SEGMENT_LABELS[lower] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
  );
}

function findLogicalBreadcrumbRule(path: string) {
  return LOGICAL_BREADCRUMB_RULES.find(
    (rule) => path === rule.prefix || path.startsWith(`${rule.prefix}/`)
  );
}

function buildBreadcrumbs(pathname: string, overrides: Map<string, string>): string[] {
  const path = pathname.split("?")[0].split("#")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return ["Dashboard"];
  const logicalRule = findLogicalBreadcrumbRule(path);
  if (logicalRule) {
    const prefixPartCount = logicalRule.prefix.split("/").filter(Boolean).length;
    const rest = parts.slice(prefixPartCount);
    return [
      ...logicalRule.labels,
      ...rest.map((p, i) => {
        const segmentIndex = prefixPartCount + i;
        const key = `${path}:${segmentIndex}`;
        const override = overrides.get(key);
        if (override) return override;
        return getBreadcrumbLabel(p, parts);
      }),
    ];
  }
  return parts.map((p, i) => {
    const key = `${path}:${i}`;
    const override = overrides.get(key);
    if (override) return override;
    return getBreadcrumbLabel(p, parts);
  });
}

export function Topbar({
  onOpenSidebar,
  onToggleSidebar,
  onOpenCommandPalette,
}: {
  onOpenSidebar?: () => void;
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
}) {
  const pathname = usePathname();
  const brandingSupabase = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anon ? createBrowserClient(url, anon) : null;
  }, []);
  const { data: companyProfile } = useQuery({
    queryKey: companyProfileQueryKey,
    queryFn: () => fetchCompanyProfileForNav(brandingSupabase!),
    enabled: Boolean(brandingSupabase),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
  });
  const orgName = companyProfile?.org_name?.trim() || "HH Group";
  const logoUrl = companyProfile?.logo_url ?? null;
  const { overrides: breadcrumbOverrides } = useBreadcrumbOverrides();
  const breadcrumbs = React.useMemo(
    () => buildBreadcrumbs(pathname ?? "", breadcrumbOverrides),
    [pathname, breadcrumbOverrides]
  );
  /** Compact trail: last two segments (项目名 › 页面名). */
  const breadcrumbLine = React.useMemo(() => {
    if (breadcrumbs.length >= 2) {
      return `${breadcrumbs[breadcrumbs.length - 2]} › ${breadcrumbs[breadcrumbs.length - 1]}`;
    }
    return breadcrumbs[0] ?? "Dashboard";
  }, [breadcrumbs]);
  const { systemHealth } = useSystemHealth();

  return (
    <header
      data-app-topbar
      className={cn(
        "neo-command-bar sticky top-0 z-40 flex h-[52px] min-h-[52px] shrink-0 items-center px-3 sm:min-h-0 sm:rounded-xl sm:px-4",
        "flex-row gap-3 sm:gap-4"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        {/* Mobile (<640px): open drawer (hamburger). */}
        <Button
          variant="outline"
          size="icon"
          className="btn-outline-ghost h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 sm:hidden"
          aria-label="Open menu"
          onClick={onOpenSidebar}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        {/* Tablet/Desktop (640px+): collapse sidebar. */}
        <Button
          variant="outline"
          size="icon"
          className="btn-outline-ghost hidden h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 sm:flex"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>

        {/* Breadcrumbs — hidden on mobile, visible tablet+ */}
        <nav
          className="hidden min-w-0 text-[13px] sm:block"
          aria-label="Breadcrumb"
          title={breadcrumbs.join(" › ")}
        >
          <span className="truncate text-[var(--neo-canvas-text-primary)]">{breadcrumbLine}</span>
        </nav>
      </div>

      {/* Global Search — 320px desktop, shrunk on tablet/mobile */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="btn-outline-ghost flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md shadow-none transition-all duration-150 ease-out sm:hidden"
          aria-label="Open command palette"
          onClick={onOpenCommandPalette}
        >
          <Search className="h-4 w-4 text-[var(--neo-text-secondary)]" strokeWidth={1.75} />
        </Button>
        <button
          type="button"
          className="group relative hidden h-8 min-w-0 items-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] sm:flex sm:w-[210px] md:w-[260px]"
          aria-label="Open command palette"
          onClick={onOpenCommandPalette}
        >
          <Search
            className="absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 shrink-0 text-[var(--neo-canvas-text-tertiary)] transition-colors duration-150 group-hover:text-[var(--neo-gold-soft)]"
            strokeWidth={1.75}
            aria-hidden
          />
          <span
            className={cn(
              "neo-topbar-command-input flex h-8 w-full min-w-0 items-center justify-between rounded-[10px] border-[0.5px] pl-8 pr-1.5 text-[13px] text-[var(--neo-canvas-text-tertiary)]",
              "transition-[background,border-color,box-shadow] duration-150"
            )}
          >
            <span className="truncate">Search projects, workers, invoices...</span>
            <NeoKeyboardHint className="ml-2 hidden shrink-0 md:inline-flex" />
          </span>
        </button>
        <div className="relative inline-flex shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="btn-outline-ghost flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md shadow-none transition-all duration-150 ease-out sm:h-[30px] sm:w-[30px] sm:min-h-0 sm:min-w-0"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-[var(--neo-text-secondary)]" />
          </Button>
          {systemHealth.status === "warning" && (
            <span
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500"
              aria-hidden
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* + New — outline, matches page primary actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 min-h-[44px] rounded-[10px] border-[rgb(184_147_90_/_0.24)] bg-[rgb(184_147_90_/_0.09)] px-3.5 py-2.5 text-sm font-medium text-[var(--neo-canvas-text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.045)_inset] transition-all duration-150 ease-out hover:-translate-y-px hover:border-[rgb(184_147_90_/_0.34)] hover:bg-[rgb(184_147_90_/_0.12)] active:scale-[0.97] active:duration-100 sm:min-h-0"
            >
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
              Projects
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/projects/new">New Project</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/estimates/new">New Estimate</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
              Work
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/tasks/new">New Task</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/punch-list/new">New Punch Issue</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/site-photos/upload">Upload Site Photo</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
              Finance
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/financial/invoices/new">New Invoice</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/financial/expenses/new">New Expense</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={UPLOAD_RECEIPT_ACTION.href}>{UPLOAD_RECEIPT_ACTION.label}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/bills/new">New Bill</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/financial/payments">Record Payment</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
              Labor
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/labor/daily">Add Daily Entry</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/labor/payments">Worker Payment</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar + dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="btn-outline-ghost relative h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 rounded-full p-0 sm:min-h-0 sm:min-w-0"
            >
              <Avatar className="h-8 w-8">
                {logoUrl ? (
                  <AvatarImage src={logoUrl} alt={orgName} className="object-contain" />
                ) : null}
                <AvatarFallback className="border border-white/10 bg-[rgb(184_147_90_/_0.12)] text-[13px] font-medium text-[var(--neo-gold-soft)]">
                  {getCompanyInitials(orgName)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings/account">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/company">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/logout">Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
