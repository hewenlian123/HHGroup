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
  return SEGMENT_LABELS[lower] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

function buildBreadcrumbs(pathname: string): string[] {
  const path = pathname.split("?")[0].split("#")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return ["Dashboard"];
  return parts.map((p, i) => getBreadcrumbLabel(p, parts, i));
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
  const breadcrumbs = React.useMemo(() => buildBreadcrumbs(pathname ?? ""), [pathname]);
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
        "sticky top-0 z-40 flex h-14 sm:h-16 shrink-0 items-center border-b border-[#eee] bg-white px-3 sm:px-4 lg:px-6",
        "flex-row gap-3 sm:gap-4"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        {/* Mobile (<640px): open drawer (hamburger). */}
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 sm:hidden"
          aria-label="Open menu"
          onClick={onOpenSidebar}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        {/* Tablet/Desktop (640px+): collapse sidebar. */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 sm:flex"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>

        {/* HH GROUP / Breadcrumbs — hidden on mobile, visible tablet+ */}
        <nav
          className="hidden min-w-0 items-center gap-1 text-sm sm:flex"
          aria-label="Breadcrumb"
        >
          <span className="shrink-0 text-[13px] font-medium uppercase tracking-wide text-[#9ca3af]">
            {orgName.replace(/\s+/g, " ").toUpperCase()}
          </span>
          {breadcrumbs.length > 0 && (
            <>
              <svg className="h-[10px] w-[10px] shrink-0 opacity-30 text-[#9ca3af] dark:text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
              <div className="flex min-w-0 items-center gap-1">
                {breadcrumbs.map((label, i) => (
                  <React.Fragment key={`${label}-${i}`}>
                    {i > 0 && (
                      <svg className="h-[10px] w-[10px] shrink-0 opacity-30 text-[#9ca3af] dark:text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                    <span
                      className={cn(
                        "truncate",
                        i === breadcrumbs.length - 1
                          ? "font-medium text-[#111111] dark:text-foreground"
                          : "text-[#6b7280] dark:text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </nav>
      </div>

      {/* Global Search — 320px desktop, shrunk on tablet/mobile */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <label className="relative w-[120px] sm:w-[200px] md:w-[260px] lg:w-[320px]" htmlFor="topbar-search">
          <span className="sr-only">Search</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-[#6b7280] dark:text-muted-foreground" aria-hidden />
          <input
            id="topbar-search"
            type="search"
            placeholder="Search projects, workers, invoices..."
            className={cn(
              "h-9 w-full rounded-md bg-[#f5f5f5] dark:bg-muted pl-9 pr-3 text-sm text-[#111111] dark:text-foreground placeholder:text-[#6b7280] dark:placeholder:text-muted-foreground",
              "border-0 outline-none focus:ring-2 focus:ring-[#111] dark:focus:ring-foreground focus:ring-offset-0",
              "min-w-0 max-sm:placeholder:opacity-0"
            )}
          />
        </label>
        <div className="relative inline-flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-[30px] w-[30px] shrink-0 rounded-lg border border-gray-200 dark:border-border hover:bg-gray-50 dark:hover:bg-muted flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-[#6b7280] dark:text-muted-foreground" />
          </Button>
          {systemHealth.status === "warning" && (
            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" aria-hidden />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* + New — black background, white text, grouped dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-9 min-h-[44px] rounded-md bg-[#111] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[#333] hover:text-white sm:min-h-0"
              size="sm"
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
            <Button variant="ghost" className="relative h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 rounded-full p-0 sm:min-h-0 sm:min-w-0">
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
