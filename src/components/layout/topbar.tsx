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
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";
import { useBreadcrumbOverrides } from "@/contexts/breadcrumb-override-context";
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
  materials: "Material Catalog",
  catalog: "Catalog",
  financial: "Finance",
  finance: "Finance",
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
  receipts: "Receipt Uploads",
  reimbursements: "Reimbursements",
  "worker-invoices": "Worker Invoices",
  "payroll-summary": "Payroll Summary",
  payroll: "Payroll",
  "upload-receipt": "Upload Receipt",
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
  permissions: "Permissions",
  categories: "Categories",
  subcontracts: "Subcontracts",
  "system-health": "System Health",
  "system-tests": "System Tests",
  "system-metrics": "System Metrics",
  "system-logs": "System Logs",
  "worker-balances": "Worker Balances",
};

/** When under /labor, "payments" shows as "Worker Payments". */
function getBreadcrumbLabel(segment: string, pathSegments: string[], index: number): string {
  const lower = segment.toLowerCase();
  if (pathSegments[0] === "labor" && lower === "payments") return "Worker Payments";
  return (
    SEGMENT_LABELS[lower] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")
  );
}

function buildBreadcrumbs(pathname: string, overrides: Map<string, string>): string[] {
  const path = pathname.split("?")[0].split("#")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return ["Dashboard"];
  return parts.map((p, i) => {
    const key = `${path}:${i}`;
    const override = overrides.get(key);
    if (override) return override;
    return getBreadcrumbLabel(p, parts, i);
  });
}

export function Topbar({
  onOpenSidebar,
  onToggleSidebar,
}: {
  onOpenSidebar?: () => void;
  onToggleSidebar?: () => void;
}) {
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const pathname = usePathname();
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

  React.useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return;

    const client = createBrowserClient(url, anon);
    let mounted = true;
    const load = async () => {
      try {
        const profile = await getCompanyProfile(client);
        if (!mounted || !profile) return;
        setOrgName(profile.org_name || "HH Group");
        setLogoUrl(profile.logo_url);
      } catch {
        // Keep fallback header branding.
      }
    };
    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-11 shrink-0 items-center border-b border-gray-100 bg-white px-4 sm:px-6 dark:border-border dark:bg-background",
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
          <span className="truncate text-text-primary dark:text-foreground">{breadcrumbLine}</span>
        </nav>
      </div>

      {/* Global Search — 320px desktop, shrunk on tablet/mobile */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <label
          className="relative hidden min-w-0 sm:block sm:w-[200px] md:w-[240px]"
          htmlFor="topbar-search"
        >
          <span className="sr-only">Search</span>
          <Search
            className="absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 shrink-0 text-[#9CA3AF] dark:text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            id="topbar-search"
            type="search"
            placeholder="Search projects, workers, invoices..."
            className={cn(
              "h-[30px] w-full rounded-lg border-[0.5px] border-gray-100 bg-white pl-8 pr-2.5 text-[13px] text-[#374151] shadow-none dark:border-border dark:bg-card dark:text-foreground placeholder:text-[#9CA3AF] dark:placeholder:text-muted-foreground",
              "outline-none transition-colors duration-150 focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10 dark:focus:ring-ring/30",
              "min-w-0 max-sm:placeholder:opacity-0"
            )}
          />
        </label>
        <div className="relative inline-flex shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="btn-outline-ghost flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border-[0.5px] border-gray-300 bg-white shadow-none transition-all duration-150 ease-out dark:border-border dark:bg-card"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-text-secondary dark:text-muted-foreground" />
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
              className="h-9 min-h-[44px] rounded-md border-[0.5px] border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-text-primary shadow-none transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-50 hover:text-text-primary active:scale-[0.97] active:duration-100 sm:min-h-0 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/40"
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
              <Link href="/upload-receipt">Upload Worker Receipt</Link>
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
                <AvatarFallback className="bg-[#f5f5f5] text-[13px] font-medium text-[#111]">
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
