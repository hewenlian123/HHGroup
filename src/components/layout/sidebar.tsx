"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Receipt,
  Banknote,
  ShoppingCart,
  CreditCard,
  Clock,
  Wallet,
  Users,
  FileStack,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleDollarSign,
  CheckSquare,
  ListChecks,
  Calendar,
  Camera,
  ClipboardCheck,
  Boxes,
  Percent,
  Package,
  ReceiptText,
  Upload,
  Calculator,
  FilePen,
  AlertTriangle,
  Activity,
  FlaskConical,
  BarChart2,
  ScrollText,
  MonitorCheck,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyInitials, getCompanyProfile } from "@/lib/company-profile";
import { useSystemHealth } from "@/contexts/system-health-context";

const STORAGE_KEY = "hh.sidebarSections";

type NavItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }> };

const SECTION_KEYS = ["PROJECTS", "OPERATIONS", "FINANCE", "LABOR", "PEOPLE", "SYSTEM"] as const;

const sections: { key: (typeof SECTION_KEYS)[number]; label: string; items: NavItem[] }[] = [
  {
    key: "PROJECTS",
    label: "PROJECTS",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/estimates", label: "Estimates", icon: FileText },
      { href: "/change-orders", label: "Change Orders", icon: FilePen },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    key: "OPERATIONS",
    label: "OPERATIONS",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/punch-list", label: "Punch List", icon: ListChecks },
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/site-photos", label: "Site Photos", icon: Camera },
      { href: "/inspection-log", label: "Inspection Log", icon: ClipboardCheck },
      { href: "/materials/catalog", label: "Material Catalog", icon: Package },
    ],
  },
  {
    key: "FINANCE",
    label: "FINANCE",
    items: [
      { href: "/financial/invoices", label: "Invoices", icon: FileText },
      { href: "/financial/payments", label: "Payments Received", icon: CircleDollarSign },
      { href: "/financial/commissions", label: "Commission Payments", icon: Percent },
      { href: "/financial/deposits", label: "Deposits", icon: Banknote },
      { href: "/bills", label: "Bills", icon: Receipt },
      { href: "/financial/expenses", label: "Expenses", icon: ShoppingCart },
      { href: "/finance/advances", label: "Worker Advances", icon: CircleDollarSign },
      { href: "/financial/accounts", label: "Accounts", icon: Wallet },
    ],
  },
  {
    key: "LABOR",
    label: "LABOR",
    items: [
      { href: "/labor", label: "Time Entries", icon: Clock },
      { href: "/labor/reimbursements", label: "Reimbursements", icon: ReceiptText },
      { href: "/labor/worker-balances", label: "Worker Balances", icon: Wallet },
      { href: "/labor/payments", label: "Worker Payments", icon: CircleDollarSign },
      { href: "/labor/advances", label: "Worker Advances", icon: CircleDollarSign },
      { href: "/labor/receipts", label: "Receipt Uploads", icon: Upload },
      { href: "/labor/worker-invoices", label: "Worker Invoices", icon: FileText },
      { href: "/labor/payroll", label: "Payroll Summary", icon: Calculator },
    ],
  },
  {
    key: "PEOPLE",
    label: "PEOPLE",
    items: [
      { href: "/workers", label: "Worker Profile", icon: Users },
      { href: "/workers/summary", label: "Worker Summary", icon: BarChart2 },
      { href: "/labor/subcontractors", label: "Vendors", icon: Users },
      { href: "/subcontractors", label: "Subcontractors", icon: Users },
    ],
  },
  {
    key: "SYSTEM",
    label: "SYSTEM",
    items: [
      { href: "/system-health", label: "System Health", icon: Activity },
      { href: "/system-tests", label: "System Tests", icon: FlaskConical },
      { href: "/system-tests/ui", label: "UI Tests", icon: MonitorCheck },
      { href: "/system-metrics", label: "System Metrics", icon: BarChart2 },
      { href: "/system-logs", label: "System Logs", icon: ScrollText },
      { href: "/system/backups", label: "Backups", icon: Archive },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { href: "/documents", label: "Documents", icon: FileStack },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  className,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  className?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const [orgName, setOrgName] = React.useState("HH Group");
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => ({}));
  const sectionsInitDone = React.useRef(false);

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
        // Keep default fallback branding.
      }
    };
    void load();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (sectionsInitDone.current) return;
    sectionsInitDone.current = true;
    const isMobileOrTablet = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileOrTablet) {
      const allClosed = SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {} as Record<string, boolean>);
      setOpenSections(allClosed);
      return;
    }
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") {
          setOpenSections(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    const allOpen = SECTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: true }), {} as Record<string, boolean>);
    setOpenSections(allOpen);
  }, []);

  const setSectionOpen = React.useCallback((key: string, open: boolean) => {
    setOpenSections((prev) => {
      const next = { ...prev, [key]: open };
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const { systemHealth } = useSystemHealth();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const linkClass = (active: boolean) =>
    cn(
      "relative flex min-h-[44px] sm:h-8 sm:min-h-0 items-center rounded-md text-sm transition-all duration-200 ease-out",
      collapsed ? "justify-center px-2" : "gap-2 pl-3 pr-2.5",
      active
        ? "bg-[#f5f5f5] dark:bg-muted text-[#111111] dark:text-foreground font-medium"
        : "text-[#6B7280] dark:text-muted-foreground hover:bg-[#fafafa] dark:hover:bg-muted/50 hover:text-[#111111] dark:hover:text-foreground"
    );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-[#E5E7EB] bg-white",
          collapsed ? "w-[72px]" : "w-[260px]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center gap-2 border-b border-[#E5E7EB]",
          collapsed ? "px-3" : "px-3"
        )}
      >
        <Avatar className="h-7 w-7 rounded-md">
          {logoUrl ? <AvatarImage src={logoUrl} alt={orgName} className="object-contain" /> : null}
          <AvatarFallback className="rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
            {getCompanyInitials(orgName)}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-400">
              HH Unified
            </p>
            <p className="truncate text-sm font-semibold text-[#111111]">{orgName}</p>
          </div>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "px-2 py-3")}>
        {/* Dashboard */}
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            title={collapsed ? "Dashboard" : undefined}
            aria-label={collapsed ? "Dashboard" : undefined}
            className={linkClass(isActive("/dashboard"))}
          >
            {isActive("/dashboard") && (
              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-gray-900 dark:bg-foreground" aria-hidden />
            )}
            <LayoutDashboard className={cn("h-[13px] w-[13px] shrink-0 opacity-60", isActive("/dashboard") && "opacity-100")} strokeWidth={1.5} />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>
        </div>

        {/* Sections — Linear-style collapsible groups */}
        <div className={cn("flex flex-col gap-4", collapsed && "gap-3")} style={{ marginTop: 16 }}>
          {sections.map((section) => {
            const isOpen = openSections[section.key] ?? false;
            if (collapsed) {
              return (
                <div key={section.key} className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        title={item.label}
                        aria-label={item.label}
                        className={linkClass(active)}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-gray-900 dark:bg-foreground" aria-hidden />
                        )}
                        {Icon ? <Icon className={cn("h-[13px] w-[13px] shrink-0 opacity-60", active && "opacity-100")} /> : null}
                      </Link>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={section.key} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => setSectionOpen(section.key, !isOpen)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-4 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-[#9CA3AF] transition-colors hover:bg-gray-50"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{section.label}</span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="mt-1 flex flex-col gap-1">
                      {section.items.map((item) => {
                        const active = isActive(item.href);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            title={collapsed ? item.label : undefined}
                            aria-label={collapsed ? item.label : undefined}
                            className={linkClass(active)}
                          >
                            {active && (
                              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-gray-900 dark:bg-foreground" aria-hidden />
                            )}
                            {Icon ? <Icon className={cn("h-[13px] w-[13px] shrink-0 opacity-60", active && "opacity-100")} /> : null}
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* System Health warning indicator */}
          {systemHealth.status === "warning" && (
            <div className="flex flex-col gap-1">
              <Link
                href="/system-health"
                onClick={onNavigate}
                className={linkClass(isActive("/system-health"))}
                title="System Health"
              >
                {isActive("/system-health") && (
                  <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-gray-900 dark:bg-foreground" aria-hidden />
                )}
                <AlertTriangle className={cn("h-[13px] w-[13px] shrink-0 text-amber-500 opacity-60", isActive("/system-health") && "opacity-100")} aria-hidden />
                {!collapsed && <span className="truncate">⚠ System Health</span>}
              </Link>
            </div>
          )}

          {/* Documents & Settings */}
          <div className="flex flex-col gap-1">
            {standaloneItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={linkClass(active)}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-sm bg-gray-900 dark:bg-foreground" aria-hidden />
                  )}
                  {Icon ? <Icon className={cn("h-[13px] w-[13px] shrink-0 opacity-60", active && "opacity-100")} /> : null}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User footer */}
      {!collapsed && (
        <div className="border-t border-gray-100 dark:border-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 shrink-0 rounded-full bg-gray-100 dark:bg-muted border border-gray-200 dark:border-border flex items-center justify-center">
              <span className="text-[10px] font-medium text-gray-500 dark:text-muted-foreground">U</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-gray-900 dark:text-foreground">User</p>
              <p className="text-[10px] text-gray-400 dark:text-muted-foreground">Admin</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse button at bottom */}
      <div className="border-t border-[#E5E7EB] dark:border-border p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex h-8 w-full items-center rounded-md text-sm text-[#6B7280] transition-colors hover:bg-gray-50 hover:text-[#111111]",
            collapsed ? "justify-center px-2" : "gap-2 px-2.5"
          )}
          aria-label="Collapse sidebar"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px]" />
          ) : (
            <ChevronLeft className="h-[18px] w-[18px]" />
          )}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
